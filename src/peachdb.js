/* eslint no-console: 0*/
/* global angular,emit */
/* eslint no-param-reassign:0 */
'use strict';
document.addEventListener('deviceready', function () {
  if (/Android/i.test(navigator.userAgent)) {
    delete window.sqlitePlugin;
  }
}, false);
/**
 * Separating out network status, should probably be made to
 * be adaptable depending on environment (cordova/browser etc)
 *
 * @type {{isOnline: Function}}
 */
var PeachNetworkStatus = {
  // TODO put in smarter connection checking (check our domain every once in a while)
  lastChecked: new Date().getTime(),
  connectionTestPassed: true,
};
PeachNetworkStatus.isOnline = () => PeachNetworkStatus.connectionTestPassed;

class ExtendableError extends Error {
  constructor(message) {
    super();
    this.message = message;
    this.stack = (new Error()).stack;
    this.name = this.constructor.name;
  }
}

class PeachError extends ExtendableError {
  constructor(message, causedBy) {
    super(message);
    this.type = 'peach';
    this.causedBy = causedBy;
  }
}

class SyncError extends PeachError {
  constructor(message, causedBy) {
    super(message, causedBy);
    this.type = 'sync';
  }
}

class OfflineError extends PeachError {
  constructor(message, causedBy) {
    super(message, causedBy);
    this.type = 'offline';
  }
}
/**
 * PeachDb is a wrapper around PouchDb that keeps all REST apis magically in sync
 * autoSyncInterval set to 0 to disable auto syncing
 *
 */
class PeachDb {
  constructor($q, PeachRestangular, pouchDB, $timeout, $interval, path, selector,
    autoSync = false, autoSyncInterval = 180000, beforeSync = angular.noop,
    afterSync = angular.noop, itemLimit) {
    this.$q = $q;
    this.$timeout = $timeout;
    this.$interval = $interval;
    this.dirtyItems = [];
    this.deletedItems = [];
    this.path = path;
    this.selector = selector;
    this.itemLimit = itemLimit;
    this.syncInProgress = false;

    window.PouchDB.plugin({
      upsertBulk: function upsertBulk(docs, opts = {}) {
        const allDocsOpts = {
          keys: docs.map(doc => doc._id)
        }

        if (!opts.replace) {
          allDocsOpts.include_docs = true
        }

        return this.allDocs(allDocsOpts)
          .then(res => docs.map(doc => {
            const row = res.rows.find(row => row.id === doc._id)
            if (!row || row.error) {
              return doc
            }
            if (!opts.replace) {
              return Object.assign({}, row.doc, doc)
            }
            return Object.assign({}, doc, {
              _rev: row.value.rev
            })
          }))
          .then(docs => this.bulkDocs(docs))
      }
    });
    window.PouchDB.utils = { Promise: window.Promise };
    window.PouchDB.plugin(require('pouchdb-adapter-cordova-sqlite'));
    let options = {
      auto_compaction: true,
      adapter: 'cordova-sqlite',
      iosDatabaseLocation: 'default',
    };
    this.db = pouchDB(path, options);
    this.autoSync = autoSync;
    this.initialized = false;
    this.initPromise = null;
    this.syncingPromise = null;
    this.beforeSync = Promise.method(beforeSync);
    this.afterSync = Promise.method(afterSync);
    this.restangular = PeachRestangular.all(path);
    this.autoSyncInterval = autoSyncInterval;
    this.loggingEnabled = localStorage.getItem('peachLogging') === 'true';

    // for easy call backs
    this.loggerPromise = this.loggerPromise.bind(this);

    // use this to ensure that we are ready to start processing.
    this.whenInitialized().catch((e) => console.error('Error Initializing Peach', e));
  }

  log(... logs) {
    if (this.loggingEnabled) {
      console.log.apply(console, logs);
    }
  }

  whenInitialized() {
    if (!this.initPromise) {
      this.initPromise = Promise.resolve(this.db.info.bind(this.db))
        .bind(this)
        .then(this.loadMetadata)
        .then(() => {
          this.updateMetadata();
          this.setupAutoSync();
          return this.metadata;
        }).then(() =>

          // build name search query
          this.forcePut(this.createDesignDoc('nameSearch', (doc) => {
            if (doc.name) {
              emit(doc.name.toLowerCase());
            }
          }))
        ).then(() => this.initialized = true);
    }

    return this.initPromise.bind(this);
  }

  setupAutoSync() {
    if (this.autoSync) {
      const startAutoSync = () => {
        this.sync().catch(e => {
          throw new PeachError('Error performing initial sync', e);
        });
      };

      if (this.autoSyncInterval > 0) {
        this.$interval(() => {
          startAutoSync();
        }, this.autoSyncInterval);
      }

      return startAutoSync();
    }

    return Promise.resolve();
  }

  onError(e) {
    console.error('Peach Error', this.path, arguments);
    return this.$q.reject(e);
  }

  /**
   * Load is completed
   * @returns {*|boolean}
   */
  isLoaded() {
    return this.initialized && this.metadata.loaded;
  }

  /**
   * Load is currently in progress
   * @returns {boolean}
   */
  isLoading() {
    return !this.initialized || !this.metadata || this.syncInProgress;
  }

  /**
   * Metadata
   * @returns {Promise}
   */
  loadMetadata() {
    const setDefaultMeta = () => {
      this.metadata = {
        _id: 'metadata',
        syncDate: null,
        syncInProgress: false,
        loadingIndex: 0,
        loaded: false,
      };

      return this.metadata;
    };

    return this.db.get('metadata')
      .then(metadata => {
        this.metadata = metadata;
        return metadata;
      }).catch(setDefaultMeta);
  }

  /**
   *
   * @param doc
   * @returns {Promise|requestHandler|*} will eventually return the item with updated _rev
   */
  forcePut(doc) {
    const updateRev = (r) => {
      // noinspection Eslint
      doc._rev = r.rev;
      return doc;
    };

    return this.$q.when(this.db.upsert(doc._id, () => doc).then(updateRev));
  }

  updateMetadata() {
    return this.forcePut(this.metadata)
      .then(doc => {
        this.metadata._rev = doc.rev;
        return this.metadata;
      }).catch(e => {
        console.error('Update metadata failed: ', e);
        return Promise.resolve(this.metadata);
      });
  }

  /**
   * Called internally by Sync to load all items. Don't call me!
   * @private
   * @returns {*|promise}
   */
  load() {
    if (!PeachNetworkStatus.isOnline()) {
      return Promise.reject(new OfflineError('Peach is Offline'));
    }

    let currentTime;
    let howMany;

    console.time('load' + this.path);
    const getCount = () => {
      currentTime = new Date();
      this.log('getting count', currentTime.valueOf());
      howMany = 500;
      this.metadata.syncDate = currentTime.valueOf();
      this.updateMetadata();
      return this.restangular.one('count').get({
        selector: this.selector,
        createdBefore: currentTime.valueOf(),
      }).then((r) => {
        this.log('got the count', r);
        return r;
      });
    };

    const loadResponseItems = response =>
      this.loadItems(response.count, howMany, currentTime)
        .then((r) => {
          this.metadata.loaded = true;
          this.updateMetadata();
          console.timeEnd('load' + this.path);
          return r;
        });

    return this.reducePromiseChain(this.loggerPromise('loading1'),
      this.whenInitialized(),
      this.loggerPromise('loading2'),
      getCount, this.loggerPromise('loading3'),
      loadResponseItems,
      this.loggerPromise('loading4')).catch(e => {
        console.error(`load failed for ${this.path} at ${new Date()}.`, e);
      });
  }

  loadItems(itemCount, howMany, currentTime) {
    return this.$q((resolve, reject) => {
      this.loadItemsLoop(0, itemCount, howMany, currentTime, resolve, reject);
    });
  }

  loadItemsLoop(loadedItems, itemCount, howMany, currentTime, resolve, reject) {
    this.loadChunk(loadedItems, howMany, currentTime).then(currentCount => {
      if (this.itemLimit && this.itemLimit < itemCount) {
        itemCount = this.itemLimit;
      }

      this.metadata.totalItemCount = itemCount;
      this.log('loading ', loadedItems, 'of', itemCount);
      loadedItems += howMany;
      this.metadata.loadedItems = loadedItems;
      if (loadedItems >= itemCount) {
        resolve(loadedItems);
      } else {
        this.loadItemsLoop(loadedItems, itemCount, howMany, currentTime, resolve, reject);
      }
    }).catch(reject);
  }

  loadChunk(start, howMany, currentTime) {
    return this.restangular.getList({
      selector: this.selector,
      startAt: start,
      limit: howMany,
      orderBy: 'id',
      orderByType: 'desc',
      createdBefore: currentTime.valueOf(),
    }).then((data) => {
      this.metadata.loadingIndex += data.length;
      this.upsertItems(data);
      return start + howMany;
    });
  }

  /**
   * Takes a set of items and gets the current _rev from the database
   * @param items
   * @returns {*}
   */
  syncRevisions(items) {
    const ids = items.map((item) => item.id);
    return ids.length < 1 ? Promise.resolve(items) :
      this.getByIds(ids, false)
        .then(docs => {
          const idMap = _.indexBy(docs, 'id');
          return items.map(item => {
            console.log(item, idMap[item.id]);
            if(idMap[item.id]) {
              _.assign(idMap[item.id], item);
            }
            return item;
          });
        });
  }

  /**
   * Prepare and insert/update items from a resource into the local database
   * @param items
   * @param updateRev should we attempt to lookup the rev or is it already specified?
   * @returns {*}
   */
  upsertItems(items = []) {
    // ensure the correct ids are set (for new items etc)
    items = items.filter(i => typeof i == 'object');
    items.forEach(item => item._id = this.idToPouchId(item.id));
    items = items.map((item) => item.plain ? item.plain() : item);

    return this.db.upsertBulk(items).catch(e => {
      throw new PeachError(`doc insertion failed for items: ${items}`, e);
    });
  }

  /**
   * Flag item as deleted from pouch and potentially server on next sync
   * @param item
   * @param localOnly
   * @returns {*}
   */
  remove(item, localOnly = false) {
    // this flag marks it as deleted in pouch
    item._deleted = true;

    return this.forcePut(item).then(res => {
      if (!localOnly) {
        this.deletedItems.push(item);
      }

      return res;
    });
  }

  removeById(id) {
    return this.getById(id).then(this.remove.bind(this)).catch(e => {
      throw new PeachError(`Removing item: ${id} failed.`, e);
    });
  }

  /**
   * Sync handles a few things
   * 1) Initial load
   * 2) Getting latest version of changes
   * 3) Sending "dirty" changes
   */

  testConnection() {
    let deferred = this.$q.defer();
    const connectionTestPassed = (passed) => {
      PeachNetworkStatus.connectionTestPassed = passed;
      PeachNetworkStatus.lastChecked = new Date().getTime();
    };

    if (new Date().getTime() - PeachNetworkStatus.lastChecked > 30000) {
      if (!navigator.onLine) {
        deferred.reject();
        connectionTestPassed(false);
      } else {
        let resolved = false;
        this.restangular.one('')
          .withHttpConfig({ timeout: 15000 })
          .head({ limit: 1 })
          .then(res => {
            resolved = true;
            deferred.resolve();
            connectionTestPassed(true);
          }).catch(err => {
            resolved = true;
            deferred.resolve();
            connectionTestPassed(true);
          });
        this.$timeout(() => {
          if (!resolved) {
            deferred.reject();
            connectionTestPassed(false);
          }
        }, 15000);
      }
    } else {
      if (PeachNetworkStatus.connectionTestPassed) {
        deferred.resolve();
      } else {
        deferred.reject();
      }
    }

    return deferred.promise;

  }

  sync() {

    const doSync = () => this.fetchServerData();

    const ensureLoaded = () => {
      if (!this.syncingPromise) {
        if (!this.isLoaded()) {
          this.syncingPromise = this.load().then(this.loggerPromise('load completed')).then(doSync);
        } else {
          this.syncingPromise = doSync();
        }

        this.syncingPromise.bind(this);
      }

      return this.syncingPromise;
    };

    return this.testConnection().then(() => {
      this.syncInProgress = true;
      return this.whenInitialized().then(ensureLoaded).catch(e => {
        throw new SyncError('Failed to sync', e);
      }).finally(() => {
        this.syncInProgress = false;
        this.syncingPromise = null;
      });

    }).catch(() => {
      console.log('Waiting for stable connection to attempt sync again');
      return this.$q.when();
    });

  }

  syncDirtyItems() {
    var syncItems = this.dirtyItems;

    //clear it temporarily
    this.dirtyItems = [];

    const getLatestDirtyDocs = this.$q.all(syncItems.map(i => this.db.get(i._id)))
      .catch((e) => {
        throw new PeachError('Error Loading Dirty Items from DB. Possibly corrupt items?', e);
      });
    const updateDirtyDocs = (docs) => {
      const updates = docs.map((doc, i) => {
        if (doc._id.indexOf('new') !== 0) {
          // existing item
          return this.restangular.one(doc.id.toString())
            .customPUT(doc, null, { selector: this.selector })
            .then(() => {
              console.debug('save completed', arguments);
            });
        } else {
          return this.restangular.customPOST(doc, null, { selector: this.selector })
            .then((result) => {
              // remove the old doc from the DB
              this.db.remove(doc._id, doc._rev);

              // help a brother out and give the in memory obj a new id
              syncItems[i].id = result.id;
              syncItems[i]._id = result._id;

              // replace it with the new one
              return this.upsertItems(_.flatten([result]));
            },

            error => {
              throw new PeachError('POST failed. Maybe your wifi is weak?', error);
            });
        }
      });

      return this.$q.all(updates);
    };

    return this.reducePromiseChain(getLatestDirtyDocs, updateDirtyDocs).catch(e => {
      console.error('Error Syncing Dirty Items', e, syncItems);
    });
  }

  syncDeletedItems() {
    if (this.deletedItems.length < 1) return Promise.resolve(true);

    // Copy and clear deletedItems
    const itemsToDelete = this.deletedItems.splice(0, this.deletedItems.length);

    const deleteSuccess = r => r;

    const deleteError = (response) => {
      let url = _.get(response, 'config.url');

      // Return the bad id from the url
      const id = url && response.status !== 404 ? _.last(url.split('/')) : null;
      console.error('Error deleting on server:', url, this.deletedItems,
        itemsToDelete, id, response);
      return Promise.reject(id);
    };

    this.log('About to delete these items', itemsToDelete);
    const deleteRequests = itemsToDelete.map((item) => item._id)
      .map(this.pouchIdToId.bind(this))
      .map((a)=> {
        this.log('normal id' + a);
        return a;
      })
      .filter(id => {
        if (id) {
          return true;
        } else {
          console.error('no id found', itemsToDelete);
          return false;
        }
      })
      .map(id=>this.restangular.customDELETE(id).then(deleteSuccess, deleteError));

    // We use settle so we can capture the failed requests and add them back
    // into the deletedItems array
    return Promise.settle(deleteRequests).then((responses) => {
      let results = _.partition(responses, r => r.isFulfilled());
      let fulfilled = results[0];
      let rejected = results[1];
      this.log('checking deleted items ful/rej', fulfilled, rejected);
      this.deletedItems = _(rejected)
        .map(promise => promise.reason())
        .filter(Boolean)
        .map(id => {
          let item = _.find(itemsToDelete, item => item.id === parseInt(id));
          if (!item) {
            console.error('can\'t find item', item, id, itemsToDelete);
          }

          return item;
        }).value();
      this.log('updated deleted items', this.deletedItems);

      return Promise.resolve(fulfilled.map(r => r.value()));
    });
  }

  syncNewRemoteItems() {
    //check for new stuff
    let newItemsPromise = this.restangular.getList({
      selector: this.selector,
      limit: 10000,
      orderBy: 'id',
      orderByType: 'desc',
      modifiedOrCreatedAfter: this.metadata.syncDate - 10000,
    }).catch(e => {
      console.error('error in syncNewRemoteItems', e);
    });

    let upsertNewItems = newItems => this.upsertItems(newItems);

    return this.reducePromiseChain(newItemsPromise, upsertNewItems);
  }

  fetchServerData() {
    this.log('calling fetch server data');
    let beforeSyncResults = this.beforeSync();

    this.updateMetadata();

    let syncResultsPromise = () =>
      Promise.settle([
        this.syncDirtyItems(),
        this.syncDeletedItems(),
        this.syncNewRemoteItems(),
      ]);

    return this.reducePromiseChain(beforeSyncResults, syncResultsPromise).then(r => {
      let results = _.partition(r, r => r.isFulfilled());
      let fulfilled = results[0];
      let rejected = results[1];
      let rejections = _(rejected)
        .map(promise => promise.reason())
        .filter(Boolean)
        .forEach(error => {
          console.error('errors syncing', error);
        }).value();

      this.metadata.syncDate = new Date().valueOf();

      if (rejections.length == 0) {
        this.afterSync();
      }

      return Promise.resolve(this.updateMetadata());
    });
  }

  idToPouchId(id) {
    return this.path + ':' + id;
  }

  pouchIdToId(id) {
    return id.split(':')[1];
  }

  /**
   *
   * @param id
   * @returns {*|promise}
   */
  getById(id) {
    return this.getByIds([id]).then((r) => r.length ? r[0] : null);
  }

  /**
   * Take a list of ids and return matching items in the same order passed in
   * @param ids
   * @param waitForSyncCompletion waits until sync is completed before returning the item by ID
   */
  getByIds(ids, waitForSyncCompletion = true) {
    var loadDocs = () => this.db.allDocs({
      keys: ids.map(this.idToPouchId.bind(this)),
      include_docs: true,
    })
    .then((results) =>  results.rows.map((row) => row.doc))
    .catch(e => {
      throw new PeachError(`getByIds failed while loadingDocs`, e);
    });

    if (waitForSyncCompletion && this.syncingPromise) {
      return this.syncingPromise.bind(this).then(loadDocs);
    } else {
      return loadDocs();
    }
  }

  /**
   * A promise that logs (requires logging to be enabled
   * @param message
   */
  loggerPromise(message) {
    return Promise.method((r) => {
      this.log('[Promise Logger] ', message, r);
      return r;
    });
  }

  /**
   * Cheater function to create design documents easier (useful for indexes)
   * @param name
   * @param mapFunction
   * @returns {{_id: string, views: {}}}
   */
  createDesignDoc(name, mapFunction) {
    var ddoc = {
      _id: '_design/' + name,
      views: {},
    };
    ddoc.views[name] = {
      map: mapFunction.toString(),
    };
    return ddoc;
  }

  /**
   * Returns all items (will ensure load has taken place)
   * @returns {*}
   */
  all() {
    let formatDocs = rawDocs => {
      let formattedDocs = _(rawDocs.rows)
        .map('doc')
        .filter((d) => (d._id && (d._id.indexOf(this.path) === 0 ||
          d._id.indexOf('new-' + this.path) === 0)));

      return formattedDocs.value();
    };

    let getRawDocs = () => this.db.allDocs({ include_docs: true }).then(formatDocs);

    let syncIfNeeded = () => {
      if ((this.isLoading() || !this.isLoaded()) && PeachNetworkStatus.isOnline()) {
        return this.sync();
      } else {
        return Promise.resolve(this.metadata);
      }
    };

    return this.reducePromiseChain(this.whenInitialized(), syncIfNeeded, getRawDocs).catch(e => {
      throw new PeachError(`Fetching all ${this.path} failed`, e);
    });
  }

  /**
   *
   * @param options See https://github.com/nolanlawson/pouchdb-find#dbfindrequest--callback
   */
  find(options) {
    if (!(this.db.find)) {
      console.error('pouch-find not installed');
      return this.$q.reject('pouch-find not installed');
    }

    //TODO: potentially check for index first?
    return this.db.find(options)
      .then(result => result.docs)
      .catch(e => {
        throw new PeachError(`Find failed for ${this.path}`, e);
      });

  }

  createIndex(options) {
    if (!(this.db.createIndex)) {
      console.error('pouch-find not installed');
      return this.$q.reject('pouch-find not installed');
    }

    return this.db.createIndex(options);
  }

  /**
   * Seach By Name
   * @param q
   * @param splitName should we check to see if there are multiple entries
   *   for the name (mainly useful for first/last name searching)
   * @returns {*|promise}
   * @param limit
   */
  searchByName(q = '', splitName = false, limit = 50) {
    let query = q.toLowerCase();
    let queryPromise;
    let initCheck;

    // we have to be loaded before we can search
    if (this.isLoaded()) {
      initCheck = this.whenInitialized();
    } else {
      initCheck = this.sync();
    }

    // if we split by name we have to load all names then filter then reload results
    const nameSearch = (nameSearch) => nameSearch.key &&
      _.some(nameSearch.key.split(' '), (name) => name.toLowerCase().indexOf(query) === 0);

    const filterResultsAndMapIds = (results) => results.filter(nameSearch).map((obj) => obj.id);

    if (!splitName) {
      // if we don't split the name we can take the "fast" path
      const options = {
        include_docs: true,
        inclusive_end: true,
        startkey: query,
        endkey: query + '\uffff',
        limit,
      };
      queryPromise = initCheck.then(() => this.db.query('nameSearch', options))
        .then((results) => results.rows.map((a) => a.doc));
    } else {
      // if we don't split the name we can take the "fast" path
      const options = {
        include_docs: false,
      };

      let getData = () => this.db.query('nameSearch', options)
        .then((results) => {
          this.allNames = results.rows;
          return results.rows;
        });

      // we already have allNames loaded so we don't have to do that again (yay)
      if (this.allNames) {
        getData = () => this.$q.when(this.allNames);
      }

      const pullFilteredDocs = filteredIds => this.db.allDocs({
        keys: filteredIds.slice(0, limit),
        include_docs: true,
      });

      queryPromise = initCheck
        .then(getData)
        .then(this.loggerPromise('result of name search'))
        .then(filterResultsAndMapIds)
        .then(this.loggerPromise('after filtering search'))
        .then(pullFilteredDocs)
        .then(this.loggerPromise('after filtering'))
        .then((results) => results.rows.map((obj) => obj.doc));
    }

    return this.$q.when(queryPromise.catch(e => {
      throw new PeachError(`Could not search for "${query}" on: ${this.path}`);
    }));
  }

  /**
   * Saves an item and prepares it for syncing
   * @param item
   * @param localOnly should this be considered "dirty" and need syncing or is
   *   this a local data change. NOTE: If this is a "new" item, this flag is ignored
   */

   saveAll(items, localOnly = false) {
     let doSync = () => this.sync()
       .catch(OfflineError, () => {
       })
       .catch(e => {
         throw new PeachError(`Save failed for ${this.path} after save while` +
           `attempting to sync db with server.`, e);
       });
     return this.$q.all(_.map(items, item => {
       // setup a new id for the item

       if (!item._id) {
         item._id = 'new-' + this.path + ':' + Date.now() + '-' + _.random(_.now());
         localOnly = false;
       }

       return this.forcePut(item)
         .then((item) => {
           if (!localOnly) {
             this.dirtyItems.push(item);
           }
         });
     })).then(() => doSync().then(() => items.length === 1 ? items[0] : items));
   }

  save(item, localOnly = false) {
    return this.saveAll([item], localOnly);
  }

  // save(item, localOnly = false) {
  //
  //   // setup a new id for the item
  //   if (!item._id) {
  //     item._id = 'new-' + this.path + ':' + Date.now();
  //     localOnly = false;
  //   }
  //
  //   let doSync = () => this.sync()
  //     .catch(OfflineError, () => {
  //     })
  //     .catch(e => {
  //       throw new PeachError(`Save failed for ${this.path} after save while ` +
  //          `attempting to sync db with server.`, e);
  //     });
  //
  //   return this.forcePut(item)
  //     .then((item) => {
  //       if (!localOnly) {
  //         this.dirtyItems.push(item);
  //       }
  //     }).then(() => {
  //       return doSync().then(() => item);
  //     });
  // }

  /*
   * Given an array of  promises, functions, or values:
   * reduce each item left to right passing the resolved value to the next
   * promise in the chain.
   */
  reducePromiseChain(...promises) {
    let [head, ...tail] = promises;

    /* Given a promise, function, or value: get its resolved value */
    let getValue = (promise, resolvedValue) => _.isFunction(promise) ?
      Promise.method(promise)(resolvedValue) :
      Promise.resolve(promise);

    return tail.reduce((chain, p) => chain.then(r => getValue(p, r)),
      Promise.resolve(getValue(head, undefined)));
  }

  /**
   * Use for creating angular services
   * @returns {Function}
   */
  static service() {
    return ($q, PeachRestangular, pouchDB, $timeout, $interval) =>
      (path, selector, autoSync = true, autoSyncInterval = 180000, beforeSync = angular.noop,
        afterSync = angular.noop, itemLimit) =>
        new PeachDb($q, PeachRestangular, pouchDB, $timeout, $interval, path, selector,
          autoSync, autoSyncInterval, beforeSync, afterSync, itemLimit);
  }
}

/**
 * This class should be extended by any models in angularjs to add custom functionality.
 */
class PeachModel {
  constructor(peachDB, path, selector, itemLimit) {
    this.peachDB = peachDB;
    this.path = path;
    this.selector = selector;
    this.itemLimit = itemLimit;
    this.initDb();
    this.allResults = [];
    this.allCalled = false;
    this.$q = this.peach.$q;
    this.restangular = this.peach.restangular;
    this.isOnline = PeachNetworkStatus.isOnline;
  }

  initDb() {
    this.peach = this.peachDB(this.path, this.selector, true, 180000,
      this.beforeSync.bind(this), this.afterSync.bind(this), this.itemLimit);
    var methods = [
      'searchByName',
      'getById',
      'getByIds',
      'find',
      'createIndex',
      'save',
      'saveAll',
      'sync',
      'remove',
      'removeById',
    ];
    methods.forEach((m) => {
      if (this[m]) return; //if the user chooses to override the method let them
      this[m] = this.peach[m].bind(this.peach); // have it (NOTE, you can't call super!)
    });
  }

  beforeSync() {
    // override to add your own functionality
  }

  afterSync() {
    // override to add your own functionality (be sure to call super!)
    if (this.allCalled) {
      // trigger the all array to be updated
      this.all();
    }
  }

  all() {
    const allResults = this.peach.all()
      .then((items) => {
        this.allCalled = true;
        this.allResults.splice(0, this.allResults.length);
        items.forEach((item) => {
          this.allResults.push(item);
        });
        return this.allResults;
      });

    return this.$q.when(allResults);
  }

  /**
   * Creates an angular factory and ensures a singleton instance for the class
   * @param PeachClass
   * @returns {instance}
   */
  static factory(PeachClass) {
    return (peachDB, $injector) => {
      if (!PeachModel.instances.has(PeachClass)) {
        PeachModel.instances.set(PeachClass, new PeachClass(peachDB, $injector));
      }

      return PeachModel.instances.get(PeachClass);
    };
  }

  /**
   * Destroy all passed in peachDBs (if not specified will destroy all in meory
   */
  static destroy(instances = PeachModel.instances.values()) {
    if (instances && instances.length) {
      //hacky fun times to get a q instance
      var $q = instances[0].$q;
      return $q.all(instances.map((model) => {
        model.destroyed = true;
        return model.peach.db.destroy();
      }));
    }
  }

  /**
   * Recreates  destroyed instances
   * @param instances
   */
  static reinit(instances = PeachModel.instances.values()) {
    instances.filter(p => p.destroyed).map((model) => model.initDb());
  }
}

PeachModel.instances = new Map();

PeachModel.$inject = ['peach'];

angular.module('peach', ['restangular', 'pouchdb'])
  .config((pouchDBProvider, POUCHDB_METHODS) => {
    // Example for nolanlawson/pouchdb-authentication
    const authMethods = {
      upsert: 'qify',
      find: 'qify',
      putIfNotExists: 'qify',
      query: 'qify'
    };

    pouchDBProvider.methods = angular.extend({}, POUCHDB_METHODS, authMethods);
  })
  .factory('PeachRestangular', (Restangular) =>
    Restangular.withConfig((RestangularConfigurer) => {
      RestangularConfigurer.setRestangularFields({
        route: '$route',
      });

      // TODO, remove? i don't think this serves a purpose
      RestangularConfigurer.addResponseInterceptor((data) => data);

      if (localStorage.getItem('peachLogging') == 'true') {
        RestangularConfigurer.addRequestInterceptor((data, method, data3, url) => {
          console.log('Restangular Request', data, method, data3, url);
          return data;
        });
      }
    })
  )
  .service('peachDB', PeachDb.service());
