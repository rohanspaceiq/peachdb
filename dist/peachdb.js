/* eslint no-console: 0*/
/* global angular,emit */
/* eslint no-param-reassign:0 */
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x12, _x13, _x14) { var _again = true; _function: while (_again) { var object = _x12, property = _x13, receiver = _x14; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x12 = parent; _x13 = property; _x14 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

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
  connectionTestPassed: true
};
PeachNetworkStatus.isOnline = function () {
  return PeachNetworkStatus.connectionTestPassed;
};

var ExtendableError = (function (_Error) {
  _inherits(ExtendableError, _Error);

  function ExtendableError(message) {
    _classCallCheck(this, ExtendableError);

    _get(Object.getPrototypeOf(ExtendableError.prototype), 'constructor', this).call(this);
    this.message = message;
    this.stack = new Error().stack;
    this.name = this.constructor.name;
  }

  return ExtendableError;
})(Error);

var PeachError = (function (_ExtendableError) {
  _inherits(PeachError, _ExtendableError);

  function PeachError(message, causedBy) {
    _classCallCheck(this, PeachError);

    _get(Object.getPrototypeOf(PeachError.prototype), 'constructor', this).call(this, message);
    this.type = 'peach';
    this.causedBy = causedBy;
  }

  return PeachError;
})(ExtendableError);

var SyncError = (function (_PeachError) {
  _inherits(SyncError, _PeachError);

  function SyncError(message, causedBy) {
    _classCallCheck(this, SyncError);

    _get(Object.getPrototypeOf(SyncError.prototype), 'constructor', this).call(this, message, causedBy);
    this.type = 'sync';
  }

  return SyncError;
})(PeachError);

var OfflineError = (function (_PeachError2) {
  _inherits(OfflineError, _PeachError2);

  function OfflineError(message, causedBy) {
    _classCallCheck(this, OfflineError);

    _get(Object.getPrototypeOf(OfflineError.prototype), 'constructor', this).call(this, message, causedBy);
    this.type = 'offline';
  }

  /**
   * PeachDb is a wrapper around PouchDb that keeps all REST apis magically in sync
   * autoSyncInterval set to 0 to disable auto syncing
   *
   */
  return OfflineError;
})(PeachError);

var PeachDb = (function () {
  function PeachDb($q, PeachRestangular, pouchDB, $timeout, $interval, path, selector, autoSync, autoSyncInterval, beforeSync, afterSync, itemLimit) {
    if (autoSync === undefined) autoSync = false;
    if (autoSyncInterval === undefined) autoSyncInterval = 180000;
    if (beforeSync === undefined) beforeSync = angular.noop;
    if (afterSync === undefined) afterSync = angular.noop;

    _classCallCheck(this, PeachDb);

    this.$q = $q;
    this.$timeout = $timeout;
    this.$interval = $interval;
    this.dirtyItems = [];
    this.deletedItems = [];
    this.path = path;
    this.selector = selector;
    this.itemLimit = itemLimit;
    this.syncInProgress = false;
    var options = {
      auto_compaction: true
    };

    /**
     * If `openDatabase` is defined that means websql is still supported, which in turn means
     * we are running the mail app in iOS 12. Otherwise, we are on iOS 13 and we want to use
     * sqlite because websql is not supported and indexeDB is really slow.
     */
    if (!!openDatabase) {
      options = _extends({}, options, {
        adapter: 'websql'
      });
    } else {
      PouchDB.plugin(PouchAdapterCordovaSqlite);
      options = _extends({}, options, {
        adapter: 'cordova-sqlite',
        iosDatabaseLocation: 'default'
      });
    }
    window.PouchDB.plugin({
      upsertBulk: function upsertBulk(docs) {
        var _this = this;

        var opts = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

        var allDocsOpts = {
          keys: docs.map(function (doc) {
            return doc._id;
          })
        };

        if (!opts.replace) {
          allDocsOpts.include_docs = true;
        }

        return this.allDocs(allDocsOpts).then(function (res) {
          return docs.map(function (doc) {
            var row = res.rows.find(function (row) {
              return row.id === doc._id;
            });
            if (!row || row.error) {
              return doc;
            }
            if (!opts.replace) {
              return Object.assign({}, row.doc, doc);
            }
            return Object.assign({}, doc, {
              _rev: row.value.rev
            });
          });
        }).then(function (docs) {
          return _this.bulkDocs(docs);
        });
      }
    });
    window.PouchDB.utils = { Promise: window.Promise };
    /**
     * if we're using sqlite we can't use forward slashes for database names.
     */
    console.log(path);
    this.db = pouchDB(!!openDatabase ? path : path.replace('/', ''), options);
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
    this.whenInitialized()['catch'](function (e) {
      return console.error('Error Initializing Peach', e);
    });
  }

  /**
   * This class should be extended by any models in angularjs to add custom functionality.
   */

  _createClass(PeachDb, [{
    key: 'log',
    value: function log() {
      if (this.loggingEnabled) {
        for (var _len = arguments.length, logs = Array(_len), _key = 0; _key < _len; _key++) {
          logs[_key] = arguments[_key];
        }

        console.log.apply(console, logs);
      }
    }
  }, {
    key: 'whenInitialized',
    value: function whenInitialized() {
      var _this2 = this;

      if (!this.initPromise) {
        this.initPromise = Promise.resolve(this.db.info.bind(this.db)).bind(this).then(this.loadMetadata).then(function () {
          _this2.updateMetadata();
          _this2.setupAutoSync();
          return _this2.metadata;
        }).then(function () {
          return(

            // build name search query
            _this2.forcePut(_this2.createDesignDoc('nameSearch', function (doc) {
              if (doc.name) {
                emit(doc.name.toLowerCase());
              }
            }))
          );
        }).then(function () {
          return _this2.initialized = true;
        });
      }

      return this.initPromise.bind(this);
    }
  }, {
    key: 'setupAutoSync',
    value: function setupAutoSync() {
      var _this3 = this;

      if (this.autoSync) {
        var _ret = (function () {
          var startAutoSync = function startAutoSync() {
            _this3.sync()['catch'](function (e) {
              throw new PeachError('Error performing initial sync', e);
            });
          };

          if (_this3.autoSyncInterval > 0) {
            _this3.$interval(function () {
              startAutoSync();
            }, _this3.autoSyncInterval);
          }

          return {
            v: startAutoSync()
          };
        })();

        if (typeof _ret === 'object') return _ret.v;
      }

      return Promise.resolve();
    }
  }, {
    key: 'onError',
    value: function onError(e) {
      console.error('Peach Error', this.path, arguments);
      return this.$q.reject(e);
    }

    /**
     * Load is completed
     * @returns {*|boolean}
     */
  }, {
    key: 'isLoaded',
    value: function isLoaded() {
      return this.initialized && this.metadata.loaded;
    }

    /**
     * Load is currently in progress
     * @returns {boolean}
     */
  }, {
    key: 'isLoading',
    value: function isLoading() {
      return !this.initialized || !this.metadata || this.syncInProgress;
    }

    /**
     * Metadata
     * @returns {Promise}
     */
  }, {
    key: 'loadMetadata',
    value: function loadMetadata() {
      var _this4 = this;

      var setDefaultMeta = function setDefaultMeta() {
        _this4.metadata = {
          _id: 'metadata',
          syncDate: null,
          syncInProgress: false,
          loadingIndex: 0,
          loaded: false
        };

        return _this4.metadata;
      };

      return this.db.get('metadata').then(function (metadata) {
        _this4.metadata = metadata;
        return metadata;
      })['catch'](setDefaultMeta);
    }

    /**
     *
     * @param doc
     * @returns {Promise|requestHandler|*} will eventually return the item with updated _rev
     */
  }, {
    key: 'forcePut',
    value: function forcePut(doc) {
      var updateRev = function updateRev(r) {
        // noinspection Eslint
        doc._rev = r.rev;
        return doc;
      };

      return this.$q.when(this.db.upsert(doc._id, function () {
        return doc;
      }).then(updateRev));
    }
  }, {
    key: 'updateMetadata',
    value: function updateMetadata() {
      var _this5 = this;

      return this.forcePut(this.metadata).then(function (doc) {
        _this5.metadata._rev = doc.rev;
        return _this5.metadata;
      })['catch'](function (e) {
        console.error('Update metadata failed: ', e);
        return Promise.resolve(_this5.metadata);
      });
    }

    /**
     * Called internally by Sync to load all items. Don't call me!
     * @private
     * @returns {*|promise}
     */
  }, {
    key: 'load',
    value: function load() {
      var _this6 = this;

      if (!PeachNetworkStatus.isOnline()) {
        return Promise.reject(new OfflineError('Peach is Offline'));
      }

      var currentTime = undefined;
      var howMany = undefined;

      console.time('load' + this.path);
      var getCount = function getCount() {
        currentTime = new Date();
        _this6.log('getting count', currentTime.valueOf());
        howMany = 500;
        _this6.metadata.syncDate = currentTime.valueOf();
        _this6.updateMetadata();
        return _this6.restangular.one('count').get({
          selector: _this6.selector,
          createdBefore: currentTime.valueOf()
        }).then(function (r) {
          _this6.log('got the count', r);
          return r;
        });
      };

      var loadResponseItems = function loadResponseItems(response) {
        return _this6.loadItems(response.count, howMany, currentTime).then(function (r) {
          _this6.metadata.loaded = true;
          _this6.updateMetadata();
          console.timeEnd('load' + _this6.path);
          return r;
        });
      };

      return this.reducePromiseChain(this.loggerPromise('loading1'), this.whenInitialized(), this.loggerPromise('loading2'), getCount, this.loggerPromise('loading3'), loadResponseItems, this.loggerPromise('loading4'))['catch'](function (e) {
        console.error('load failed for ' + _this6.path + ' at ' + new Date() + '.', e);
      });
    }
  }, {
    key: 'loadItems',
    value: function loadItems(itemCount, howMany, currentTime) {
      var _this7 = this;

      return this.$q(function (resolve, reject) {
        _this7.loadItemsLoop(0, itemCount, howMany, currentTime, resolve, reject);
      });
    }
  }, {
    key: 'loadItemsLoop',
    value: function loadItemsLoop(loadedItems, itemCount, howMany, currentTime, resolve, reject) {
      var _this8 = this;

      this.loadChunk(loadedItems, howMany, currentTime).then(function (currentCount) {
        if (_this8.itemLimit && _this8.itemLimit < itemCount) {
          itemCount = _this8.itemLimit;
        }

        _this8.metadata.totalItemCount = itemCount;
        _this8.log('loading ', loadedItems, 'of', itemCount);
        loadedItems += howMany;
        _this8.metadata.loadedItems = loadedItems;
        if (loadedItems >= itemCount) {
          resolve(loadedItems);
        } else {
          _this8.loadItemsLoop(loadedItems, itemCount, howMany, currentTime, resolve, reject);
        }
      })['catch'](reject);
    }
  }, {
    key: 'loadChunk',
    value: function loadChunk(start, howMany, currentTime) {
      var _this9 = this;

      return this.restangular.getList({
        selector: this.selector,
        startAt: start,
        limit: howMany,
        orderBy: 'id',
        orderByType: 'desc',
        createdBefore: currentTime.valueOf()
      }).then(function (data) {
        _this9.metadata.loadingIndex += data.length;
        _this9.upsertItems(data);
        return start + howMany;
      });
    }

    /**
     * Takes a set of items and gets the current _rev from the database
     * @param items
     * @returns {*}
     */
  }, {
    key: 'syncRevisions',
    value: function syncRevisions(items) {
      var ids = items.map(function (item) {
        return item.id;
      });
      return ids.length < 1 ? Promise.resolve(items) : this.getByIds(ids, false).then(function (docs) {
        var idMap = _.indexBy(docs, 'id');
        return items.map(function (item) {
          console.log(item, idMap[item.id]);
          if (idMap[item.id]) {
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
  }, {
    key: 'upsertItems',
    value: function upsertItems() {
      var _this10 = this;

      var items = arguments.length <= 0 || arguments[0] === undefined ? [] : arguments[0];

      // ensure the correct ids are set (for new items etc)
      items = items.filter(function (i) {
        return typeof i == 'object';
      });
      items.forEach(function (item) {
        return item._id = _this10.idToPouchId(item.id);
      });
      items = items.map(function (item) {
        return item.plain ? item.plain() : item;
      });

      return this.db.upsertBulk(items)['catch'](function (e) {
        throw new PeachError('doc insertion failed for items: ' + items, e);
      });
    }

    /**
     * Flag item as deleted from pouch and potentially server on next sync
     * @param item
     * @param localOnly
     * @returns {*}
     */
  }, {
    key: 'remove',
    value: function remove(item) {
      var _this11 = this;

      var localOnly = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

      // this flag marks it as deleted in pouch
      item._deleted = true;

      return this.forcePut(item).then(function (res) {
        if (!localOnly) {
          _this11.deletedItems.push(item);
        }

        return res;
      });
    }
  }, {
    key: 'removeById',
    value: function removeById(id) {
      return this.getById(id).then(this.remove.bind(this))['catch'](function (e) {
        throw new PeachError('Removing item: ' + id + ' failed.', e);
      });
    }

    /**
     * Sync handles a few things
     * 1) Initial load
     * 2) Getting latest version of changes
     * 3) Sending "dirty" changes
     */

  }, {
    key: 'testConnection',
    value: function testConnection() {
      var _this12 = this;

      var deferred = this.$q.defer();
      var connectionTestPassed = function connectionTestPassed(passed) {
        PeachNetworkStatus.connectionTestPassed = passed;
        PeachNetworkStatus.lastChecked = new Date().getTime();
      };

      if (new Date().getTime() - PeachNetworkStatus.lastChecked > 30000) {
        if (!navigator.onLine) {
          deferred.reject();
          connectionTestPassed(false);
        } else {
          (function () {
            var resolved = false;
            _this12.restangular.one('').withHttpConfig({ timeout: 15000 }).head({ limit: 1 }).then(function (res) {
              resolved = true;
              deferred.resolve();
              connectionTestPassed(true);
            })['catch'](function (err) {
              resolved = true;
              deferred.resolve();
              connectionTestPassed(true);
            });
            _this12.$timeout(function () {
              if (!resolved) {
                deferred.reject();
                connectionTestPassed(false);
              }
            }, 15000);
          })();
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
  }, {
    key: 'sync',
    value: function sync() {
      var _this13 = this;

      var doSync = function doSync() {
        return _this13.fetchServerData();
      };

      var ensureLoaded = function ensureLoaded() {
        if (!_this13.syncingPromise) {
          if (!_this13.isLoaded()) {
            _this13.syncingPromise = _this13.load().then(_this13.loggerPromise('load completed')).then(doSync);
          } else {
            _this13.syncingPromise = doSync();
          }

          _this13.syncingPromise.bind(_this13);
        }

        return _this13.syncingPromise;
      };

      return this.testConnection().then(function () {
        _this13.syncInProgress = true;
        return _this13.whenInitialized().then(ensureLoaded)['catch'](function (e) {
          throw new SyncError('Failed to sync', e);
        })['finally'](function () {
          _this13.syncInProgress = false;
          _this13.syncingPromise = null;
        });
      })['catch'](function () {
        console.log('Waiting for stable connection to attempt sync again');
        return _this13.$q.when();
      });
    }
  }, {
    key: 'syncDirtyItems',
    value: function syncDirtyItems() {
      var _this14 = this,
          _arguments2 = arguments;

      var syncItems = this.dirtyItems;

      //clear it temporarily
      this.dirtyItems = [];

      var getLatestDirtyDocs = this.$q.all(syncItems.map(function (i) {
        return _this14.db.get(i._id);
      }))['catch'](function (e) {
        throw new PeachError('Error Loading Dirty Items from DB. Possibly corrupt items?', e);
      });
      var updateDirtyDocs = function updateDirtyDocs(docs) {
        var updates = docs.map(function (doc, i) {
          if (doc._id.indexOf('new') !== 0) {
            // existing item
            return _this14.restangular.one(doc.id.toString()).customPUT(doc, null, { selector: _this14.selector }).then(function () {
              console.debug('save completed', _arguments2);
            });
          } else {
            return _this14.restangular.customPOST(doc, null, { selector: _this14.selector }).then(function (result) {
              // remove the old doc from the DB
              _this14.db.remove(doc._id, doc._rev);

              // help a brother out and give the in memory obj a new id
              syncItems[i].id = result.id;
              syncItems[i]._id = result._id;

              // replace it with the new one
              return _this14.upsertItems(_.flatten([result]));
            }, function (error) {
              throw new PeachError('POST failed. Maybe your wifi is weak?', error);
            });
          }
        });

        return _this14.$q.all(updates);
      };

      return this.reducePromiseChain(getLatestDirtyDocs, updateDirtyDocs)['catch'](function (e) {
        console.error('Error Syncing Dirty Items', e, syncItems);
      });
    }
  }, {
    key: 'syncDeletedItems',
    value: function syncDeletedItems() {
      var _this15 = this;

      if (this.deletedItems.length < 1) return Promise.resolve(true);

      // Copy and clear deletedItems
      var itemsToDelete = this.deletedItems.splice(0, this.deletedItems.length);

      var deleteSuccess = function deleteSuccess(r) {
        return r;
      };

      var deleteError = function deleteError(response) {
        var url = _.get(response, 'config.url');

        // Return the bad id from the url
        var id = url && response.status !== 404 ? _.last(url.split('/')) : null;
        console.error('Error deleting on server:', url, _this15.deletedItems, itemsToDelete, id, response);
        return Promise.reject(id);
      };

      this.log('About to delete these items', itemsToDelete);
      var deleteRequests = itemsToDelete.map(function (item) {
        return item._id;
      }).map(this.pouchIdToId.bind(this)).map(function (a) {
        _this15.log('normal id' + a);
        return a;
      }).filter(function (id) {
        if (id) {
          return true;
        } else {
          console.error('no id found', itemsToDelete);
          return false;
        }
      }).map(function (id) {
        return _this15.restangular.customDELETE(id).then(deleteSuccess, deleteError);
      });

      // We use settle so we can capture the failed requests and add them back
      // into the deletedItems array
      return Promise.settle(deleteRequests).then(function (responses) {
        var results = _.partition(responses, function (r) {
          return r.isFulfilled();
        });
        var fulfilled = results[0];
        var rejected = results[1];
        _this15.log('checking deleted items ful/rej', fulfilled, rejected);
        _this15.deletedItems = _(rejected).map(function (promise) {
          return promise.reason();
        }).filter(Boolean).map(function (id) {
          var item = _.find(itemsToDelete, function (item) {
            return item.id === parseInt(id);
          });
          if (!item) {
            console.error('can\'t find item', item, id, itemsToDelete);
          }

          return item;
        }).value();
        _this15.log('updated deleted items', _this15.deletedItems);

        return Promise.resolve(fulfilled.map(function (r) {
          return r.value();
        }));
      });
    }
  }, {
    key: 'syncNewRemoteItems',
    value: function syncNewRemoteItems() {
      var _this16 = this;

      //check for new stuff
      var newItemsPromise = this.restangular.getList({
        selector: this.selector,
        limit: 10000,
        orderBy: 'id',
        orderByType: 'desc',
        modifiedOrCreatedAfter: this.metadata.syncDate - 10000
      })['catch'](function (e) {
        console.error('error in syncNewRemoteItems', e);
      });

      var upsertNewItems = function upsertNewItems(newItems) {
        return _this16.upsertItems(newItems);
      };

      return this.reducePromiseChain(newItemsPromise, upsertNewItems);
    }
  }, {
    key: 'fetchServerData',
    value: function fetchServerData() {
      var _this17 = this;

      this.log('calling fetch server data');
      var beforeSyncResults = this.beforeSync();

      this.updateMetadata();

      var syncResultsPromise = function syncResultsPromise() {
        return Promise.settle([_this17.syncDirtyItems(), _this17.syncDeletedItems(), _this17.syncNewRemoteItems()]);
      };

      return this.reducePromiseChain(beforeSyncResults, syncResultsPromise).then(function (r) {
        var results = _.partition(r, function (r) {
          return r.isFulfilled();
        });
        var fulfilled = results[0];
        var rejected = results[1];
        var rejections = _(rejected).map(function (promise) {
          return promise.reason();
        }).filter(Boolean).forEach(function (error) {
          console.error('errors syncing', error);
        }).value();

        _this17.metadata.syncDate = new Date().valueOf();

        if (rejections.length == 0) {
          _this17.afterSync();
        }

        return Promise.resolve(_this17.updateMetadata());
      });
    }
  }, {
    key: 'idToPouchId',
    value: function idToPouchId(id) {
      return this.path + ':' + id;
    }
  }, {
    key: 'pouchIdToId',
    value: function pouchIdToId(id) {
      return id.split(':')[1];
    }

    /**
     *
     * @param id
     * @returns {*|promise}
     */
  }, {
    key: 'getById',
    value: function getById(id) {
      return this.getByIds([id]).then(function (r) {
        return r.length ? r[0] : null;
      });
    }

    /**
     * Take a list of ids and return matching items in the same order passed in
     * @param ids
     * @param waitForSyncCompletion waits until sync is completed before returning the item by ID
     */
  }, {
    key: 'getByIds',
    value: function getByIds(ids) {
      var _this18 = this;

      var waitForSyncCompletion = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];

      var loadDocs = function loadDocs() {
        return _this18.db.allDocs({
          keys: ids.map(_this18.idToPouchId.bind(_this18)),
          include_docs: true
        }).then(function (results) {
          return results.rows.map(function (row) {
            return row.doc;
          });
        })['catch'](function (e) {
          throw new PeachError('getByIds failed while loadingDocs', e);
        });
      };

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
  }, {
    key: 'loggerPromise',
    value: function loggerPromise(message) {
      var _this19 = this;

      return Promise.method(function (r) {
        _this19.log('[Promise Logger] ', message, r);
        return r;
      });
    }

    /**
     * Cheater function to create design documents easier (useful for indexes)
     * @param name
     * @param mapFunction
     * @returns {{_id: string, views: {}}}
     */
  }, {
    key: 'createDesignDoc',
    value: function createDesignDoc(name, mapFunction) {
      var ddoc = {
        _id: '_design/' + name,
        views: {}
      };
      ddoc.views[name] = {
        map: mapFunction.toString()
      };
      return ddoc;
    }

    /**
     * Returns all items (will ensure load has taken place)
     * @returns {*}
     */
  }, {
    key: 'all',
    value: function all() {
      var _this20 = this;

      var formatDocs = function formatDocs(rawDocs) {
        var formattedDocs = _(rawDocs.rows).map('doc').filter(function (d) {
          return d._id && (d._id.indexOf(_this20.path) === 0 || d._id.indexOf('new-' + _this20.path) === 0);
        });

        return formattedDocs.value();
      };

      var getRawDocs = function getRawDocs() {
        return _this20.db.allDocs({ include_docs: true }).then(formatDocs);
      };

      var syncIfNeeded = function syncIfNeeded() {
        if ((_this20.isLoading() || !_this20.isLoaded()) && PeachNetworkStatus.isOnline()) {
          return _this20.sync();
        } else {
          return Promise.resolve(_this20.metadata);
        }
      };

      return this.reducePromiseChain(this.whenInitialized(), syncIfNeeded, getRawDocs)['catch'](function (e) {
        throw new PeachError('Fetching all ' + _this20.path + ' failed', e);
      });
    }

    /**
     *
     * @param options See https://github.com/nolanlawson/pouchdb-find#dbfindrequest--callback
     */
  }, {
    key: 'find',
    value: function find(options) {
      var _this21 = this;

      if (!this.db.find) {
        console.error('pouch-find not installed');
        return this.$q.reject('pouch-find not installed');
      }

      //TODO: potentially check for index first?
      return this.db.find(options).then(function (result) {
        return result.docs;
      })['catch'](function (e) {
        throw new PeachError('Find failed for ' + _this21.path, e);
      });
    }
  }, {
    key: 'createIndex',
    value: function createIndex(options) {
      if (!this.db.createIndex) {
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
  }, {
    key: 'searchByName',
    value: function searchByName() {
      var q = arguments.length <= 0 || arguments[0] === undefined ? '' : arguments[0];

      var _this22 = this;

      var splitName = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];
      var limit = arguments.length <= 2 || arguments[2] === undefined ? 50 : arguments[2];

      var query = q.toLowerCase();
      var queryPromise = undefined;
      var initCheck = undefined;

      // we have to be loaded before we can search
      if (this.isLoaded()) {
        initCheck = this.whenInitialized();
      } else {
        initCheck = this.sync();
      }

      // if we split by name we have to load all names then filter then reload results
      var nameSearch = function nameSearch(_nameSearch) {
        return _nameSearch.key && _.some(_nameSearch.key.split(' '), function (name) {
          return name.toLowerCase().indexOf(query) === 0;
        });
      };

      var filterResultsAndMapIds = function filterResultsAndMapIds(results) {
        return results.filter(nameSearch).map(function (obj) {
          return obj.id;
        });
      };

      if (!splitName) {
        (function () {
          // if we don't split the name we can take the "fast" path
          var options = {
            include_docs: true,
            inclusive_end: true,
            startkey: query,
            endkey: query + '￿',
            limit: limit
          };
          queryPromise = initCheck.then(function () {
            return _this22.db.query('nameSearch', options);
          }).then(function (results) {
            return results.rows.map(function (a) {
              return a.doc;
            });
          });
        })();
      } else {
        (function () {
          // if we don't split the name we can take the "fast" path
          var options = {
            include_docs: false
          };

          var getData = function getData() {
            return _this22.db.query('nameSearch', options).then(function (results) {
              _this22.allNames = results.rows;
              return results.rows;
            });
          };

          // we already have allNames loaded so we don't have to do that again (yay)
          if (_this22.allNames) {
            getData = function () {
              return _this22.$q.when(_this22.allNames);
            };
          }

          var pullFilteredDocs = function pullFilteredDocs(filteredIds) {
            return _this22.db.allDocs({
              keys: filteredIds.slice(0, limit),
              include_docs: true
            });
          };

          queryPromise = initCheck.then(getData).then(_this22.loggerPromise('result of name search')).then(filterResultsAndMapIds).then(_this22.loggerPromise('after filtering search')).then(pullFilteredDocs).then(_this22.loggerPromise('after filtering')).then(function (results) {
            return results.rows.map(function (obj) {
              return obj.doc;
            });
          });
        })();
      }

      return this.$q.when(queryPromise['catch'](function (e) {
        throw new PeachError('Could not search for "' + query + '" on: ' + _this22.path);
      }));
    }

    /**
     * Saves an item and prepares it for syncing
     * @param item
     * @param localOnly should this be considered "dirty" and need syncing or is
     *   this a local data change. NOTE: If this is a "new" item, this flag is ignored
     */

  }, {
    key: 'saveAll',
    value: function saveAll(items) {
      var _this23 = this;

      var localOnly = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

      var doSync = function doSync() {
        return _this23.sync()['catch'](OfflineError, function () {})['catch'](function (e) {
          throw new PeachError('Save failed for ' + _this23.path + ' after save while' + 'attempting to sync db with server.', e);
        });
      };
      return this.$q.all(_.map(items, function (item) {
        // setup a new id for the item

        if (!item._id) {
          item._id = 'new-' + _this23.path + ':' + Date.now() + '-' + _.random(_.now());
          localOnly = false;
        }

        return _this23.forcePut(item).then(function (item) {
          if (!localOnly) {
            _this23.dirtyItems.push(item);
          }
        });
      })).then(function () {
        return doSync().then(function () {
          return items.length === 1 ? items[0] : items;
        });
      });
    }
  }, {
    key: 'save',
    value: function save(item) {
      var localOnly = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

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
  }, {
    key: 'reducePromiseChain',
    value: function reducePromiseChain() {
      for (var _len2 = arguments.length, promises = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        promises[_key2] = arguments[_key2];
      }

      var head = promises[0];
      var tail = promises.slice(1);

      /* Given a promise, function, or value: get its resolved value */
      var getValue = function getValue(promise, resolvedValue) {
        return _.isFunction(promise) ? Promise.method(promise)(resolvedValue) : Promise.resolve(promise);
      };

      return tail.reduce(function (chain, p) {
        return chain.then(function (r) {
          return getValue(p, r);
        });
      }, Promise.resolve(getValue(head, undefined)));
    }

    /**
     * Use for creating angular services
     * @returns {Function}
     */
  }], [{
    key: 'service',
    value: function service() {
      return function ($q, PeachRestangular, pouchDB, $timeout, $interval) {
        return function (path, selector, autoSync, autoSyncInterval, beforeSync, afterSync, itemLimit) {
          if (autoSync === undefined) autoSync = true;
          if (autoSyncInterval === undefined) autoSyncInterval = 180000;
          if (beforeSync === undefined) beforeSync = angular.noop;
          if (afterSync === undefined) afterSync = angular.noop;
          return new PeachDb($q, PeachRestangular, pouchDB, $timeout, $interval, path, selector, autoSync, autoSyncInterval, beforeSync, afterSync, itemLimit);
        };
      };
    }
  }]);

  return PeachDb;
})();

var PeachModel = (function () {
  function PeachModel(peachDB, path, selector, itemLimit) {
    _classCallCheck(this, PeachModel);

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

  _createClass(PeachModel, [{
    key: 'initDb',
    value: function initDb() {
      var _this24 = this;

      this.peach = this.peachDB(this.path, this.selector, true, 180000, this.beforeSync.bind(this), this.afterSync.bind(this), this.itemLimit);
      var methods = ['searchByName', 'getById', 'getByIds', 'find', 'createIndex', 'save', 'saveAll', 'sync', 'remove', 'removeById'];
      methods.forEach(function (m) {
        if (_this24[m]) return; //if the user chooses to override the method let them
        _this24[m] = _this24.peach[m].bind(_this24.peach); // have it (NOTE, you can't call super!)
      });
    }
  }, {
    key: 'beforeSync',
    value: function beforeSync() {
      // override to add your own functionality
    }
  }, {
    key: 'afterSync',
    value: function afterSync() {
      // override to add your own functionality (be sure to call super!)
      if (this.allCalled) {
        // trigger the all array to be updated
        this.all();
      }
    }
  }, {
    key: 'all',
    value: function all() {
      var _this25 = this;

      var allResults = this.peach.all().then(function (items) {
        _this25.allCalled = true;
        _this25.allResults.splice(0, _this25.allResults.length);
        items.forEach(function (item) {
          _this25.allResults.push(item);
        });
        return _this25.allResults;
      });

      return this.$q.when(allResults);
    }

    /**
     * Creates an angular factory and ensures a singleton instance for the class
     * @param PeachClass
     * @returns {instance}
     */
  }], [{
    key: 'factory',
    value: function factory(PeachClass) {
      return function (peachDB, $injector) {
        if (!PeachModel.instances.has(PeachClass)) {
          PeachModel.instances.set(PeachClass, new PeachClass(peachDB, $injector));
        }

        return PeachModel.instances.get(PeachClass);
      };
    }

    /**
     * Destroy all passed in peachDBs (if not specified will destroy all in meory
     */
  }, {
    key: 'destroy',
    value: function destroy() {
      var instances = arguments.length <= 0 || arguments[0] === undefined ? PeachModel.instances.values() : arguments[0];

      if (instances && instances.length) {
        //hacky fun times to get a q instance
        var $q = instances[0].$q;
        return $q.all(instances.map(function (model) {
          model.destroyed = true;
          return model.peach.db.destroy();
        }));
      }
    }

    /**
     * Recreates  destroyed instances
     * @param instances
     */
  }, {
    key: 'reinit',
    value: function reinit() {
      var instances = arguments.length <= 0 || arguments[0] === undefined ? PeachModel.instances.values() : arguments[0];

      instances.filter(function (p) {
        return p.destroyed;
      }).map(function (model) {
        return model.initDb();
      });
    }
  }]);

  return PeachModel;
})();

PeachModel.instances = new Map();

PeachModel.$inject = ['peach'];

angular.module('peach', ['restangular', 'pouchdb']).config(function (pouchDBProvider, POUCHDB_METHODS) {
  // Example for nolanlawson/pouchdb-authentication
  var authMethods = {
    upsert: 'qify',
    find: 'qify',
    putIfNotExists: 'qify',
    query: 'qify'
  };

  pouchDBProvider.methods = angular.extend({}, POUCHDB_METHODS, authMethods);
}).factory('PeachRestangular', function (Restangular) {
  return Restangular.withConfig(function (RestangularConfigurer) {
    RestangularConfigurer.setRestangularFields({
      route: '$route'
    });

    // TODO, remove? i don't think this serves a purpose
    RestangularConfigurer.addResponseInterceptor(function (data) {
      return data;
    });

    if (localStorage.getItem('peachLogging') == 'true') {
      RestangularConfigurer.addRequestInterceptor(function (data, method, data3, url) {
        console.log('Restangular Request', data, method, data3, url);
        return data;
      });
    }
  });
}).service('peachDB', PeachDb.service());