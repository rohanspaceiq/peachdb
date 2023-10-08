'use strict';
/* global angular,emit,descript,PouchDB,beforeEach,describe,expect */

describe('Peach DB', function() {
  let $httpBackend;
  let newUser;
  let peachDB;
  let users;
  let $rootScope;
  let $q;
  let peachMockBackend;
  const tableName = 'users';

  // uncomment to enable overly verbose logging
  localStorage.setItem('peachLogging', 'true');

  const catchUnresolvedPromises = (done) => {
    Promise.onPossiblyUnhandledRejection((e, promise) => {
      console.error('Unhandled Promise Rejection', e, promise);
      if (done) {
        done.fail();
      }
    });
  };

  //PouchDB.debug.enable('*');
  PouchDB.debug.disable();
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000;

  beforeEach(angular.mock.module('restangular', 'peachData', 'pouchdb', 'peach', 'peachMock'));

  beforeEach(inject(function(_peachDB_, _$httpBackend_, _$rootScope_, _newUser_, _$q_, _peachMockBackend_) {
    peachDB = _peachDB_;
    $httpBackend = _$httpBackend_;
    $rootScope = _$rootScope_;
    users = peachDB(tableName, null, false);
    newUser = _newUser_;
    $q = _$q_;
    console.log('table', tableName);
    peachMockBackend = _.partial(_peachMockBackend_, tableName);
  }));

  describe('peach instance', function() {

    let flushTimer;
    beforeEach(()=> {
      flushTimer = setInterval(function() {
        try {
          $httpBackend.flush();
        } catch (e) {
          // do nothing (this will happen all the time)
        }
      }, 100);
    });

    afterEach((done)=> {
      if (users && _.has(users, 'db')) {
        console.log('users db exists, attempting deletion');
        users.db.destroy().then(function() {
          console.log('successfully deleted');
          done();
          clearInterval(flushTimer);
        }).catch(function(res) { console.log(res); });
      } else {
        done();
        clearInterval(flushTimer);
      }
    });

    function errorHandler(rejection) {
      console.error(rejection);
      expect(rejection).toBeDefined();
    }

    function successHandler(success) {
      //noop
      console.log(success);
      return success;
    }

    it('should sync', (done)=> {
      expect(users).toBeTruthy();
      peachMockBackend();

      users.sync()
        .then(successHandler)
        .catch(errorHandler)
        .finally(()=> {
          expect(users.isLoaded()).toBeTruthy();
          done();
        });
    });

    it('should be able to do stuff before and after sync', (done)=> {
      catchUnresolvedPromises(done);
      peachMockBackend();

      var beforeSyncCalled = false;
      var afterSyncCalled = false;
      users.beforeSync = function() {
        beforeSyncCalled = true;
        expect(afterSyncCalled).toBeFalsy();
      };

      users.afterSync = function() {
        afterSyncCalled = true;
        expect(beforeSyncCalled).toBeTruthy();
      };

      users.sync()
        .then(successHandler)
        .catch(errorHandler)
        .finally(()=> {
          expect(beforeSyncCalled).toBeTruthy();
          expect(afterSyncCalled).toBeTruthy();

          //let's do it one more time to make sure everything is really happy
          beforeSyncCalled = false;
          afterSyncCalled = false;
          users.sync()
            .then(successHandler)
            .catch(errorHandler)
            .finally(()=> {
              expect(beforeSyncCalled).toBeTruthy();
              expect(afterSyncCalled).toBeTruthy();
              done();
            });

        });
    });

    it('Should add a new user.', (done) => {
      catchUnresolvedPromises(done);
      var peachBackend = peachMockBackend();
      var newUserFilter = (user)=> user.lastName == 'Danzig';
      var originalSize;

      users.all().then((originalUsers)=> {
        //then it checks to see if anything changed since it started syncing
        expect(originalUsers.length).toBeGreaterThan(0);
        originalSize = originalUsers.length;
        peachBackend.changeResponse = newUser;
      }).catch(done.fail).then(users.sync).then(()=> {
        users.all().then((users)=> {
          expect(users.length).toBeGreaterThan(originalSize);
          expect(users.filter(newUserFilter).length).toBe(1);
          done();
        });
      }).catch(done.fail);
    });

    it('Should be able to query', (done) => {
      catchUnresolvedPromises(done);
      var pb = peachMockBackend();
      pb.changeResponse = newUser;

      users.all().then((res) => {
        return users.createIndex({ index: { fields: ['employeeId'] } }).then(() => {
          return users.find({
            selector: {
              employeeId: '138',
            },
          });
        }).then((filteredUsers) => {
          expect(filteredUsers.length).toBe(1);
          done();
        });
      }).catch(function() {
        done.fail();
      });
    });

    it('Should remove a user.', (done) => {
      let originalSize;
      let userToBeRemoved;

      catchUnresolvedPromises(done);
      peachMockBackend();

      users.all().then((originalUsers)=> {
        expect(originalUsers.length).toBeGreaterThan(0);
        originalSize = originalUsers.length;
        userToBeRemoved = originalUsers[0];
        return users.removeById(userToBeRemoved.id).then(() => {
          expect(users.deletedItems).toBeArrayOfSize(1);
        });
      }).then(users.sync.bind(users)).then(()=> {
        return users.all().then((response) => {
          expect(response).toBeArrayOfSize(originalSize - 1);
          expect(_.find(response, { id: userToBeRemoved.id })).toBeUndefined();
          expect(users.deletedItems).toBeArrayOfSize(0);
          done();
        });
      }).catch(done.fail);
    });

    it('Should remove a user and be able to retry on server failure.', (done) => {
      let originalSize;
      let userToBeRemoved;

      let pb = peachMockBackend({
        deleteResponse: 500,
      });

      users.all().then((originalUsers)=> {
        expect(originalUsers.length).toBeGreaterThan(0);
        originalSize = originalUsers.length;
        userToBeRemoved = originalUsers[0];
        console.log('Ignore the below delete error, this is expected');
        return users.removeById(userToBeRemoved.id).then(() => {
          expect(users.deletedItems).toBeArrayOfSize(1);
        });
      }).then(users.sync.bind(users)).then(()=> {
        return users.all().then((response) => {
          //this should reflect the delete
          expect(response).toBeArrayOfSize(originalSize - 1);

          //the delete was not successful so it should wait until "things" start working
          expect(_.find(response, { id: userToBeRemoved.id })).toBeUndefined();
          expect(users.deletedItems).toBeArrayOfSize(1);
          pb.deleteResponse = true;
        });
      }).then(users.sync.bind(users)).then(()=> {
        return users.all().then((response) => {
          expect(response).toBeArrayOfSize(originalSize - 1);
          expect(_.find(response, { id: userToBeRemoved.id })).toBeUndefined();
          expect(users.deletedItems).toBeArrayOfSize(0);
          done();
        });
      }).catch(done.fail);
    });

    it('Should save new items', (done) => {
      catchUnresolvedPromises(done);

      //response with the id
      const newUserResponse = { firstName: 'Princess', lastName: 'Peach', id: 321 };
      peachMockBackend({ saveResponse: newUserResponse });
      var originalSize;
      users.all()
        .then((r) => originalSize = r.length)

        //save it without the id
        .then(() => users.save({ firstName: 'Princess', lastName: 'Peach' }))
        .then(() => users.all())
        .then((r) => {
          //we should have one more user than we used to
          expect(r.length).toBe(originalSize + 1);
        })
        .then(done)
        .catch((e)=> {
          console.error(e);
          done.fail();
        });
    });

    it('Should search properly', (done) => {
      catchUnresolvedPromises(done);
      peachMockBackend();

      var firstNameGoodSearchTerms = ['Troy', 'T', 'Tro', 'troy'];
      var firstNameBadSearchTerms = ['Tray', 'ZZZ', 'Sawnders', 'Se'];
      var lastNameAndFirstNameTerms = firstNameGoodSearchTerms.concat(['Saun', 'S', 'saunder']);

      var goodSearches = firstNameGoodSearchTerms.map(n => users.searchByName(n));
      var goodSplitSearches = lastNameAndFirstNameTerms.map(n => users.searchByName(n, true));
      var badSearches = firstNameBadSearchTerms.map(n => users.searchByName(n));

      var goodSearchesResults = $q.all(goodSearches.concat(goodSplitSearches)).then((promiseResults)=> {
        promiseResults.forEach((searchResults, i) => {
          expect(searchResults.length).toBeGreaterThan(0);
          searchResults.forEach(function(u) {
            expect(u.id).toBe(14720);
          });
        });
      }).catch(done.fail);

      var badSearchesResults = $q.all(badSearches).then((promiseResults)=> {
        promiseResults.forEach(function(searchResults, i) {
          expect(searchResults.length).toBe(0);
        });
      }).catch(done.fail);

      $q.all([goodSearchesResults, badSearchesResults]).catch(done.fail).finally(done);

    });
  });
});
