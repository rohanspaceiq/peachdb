class PeachMockBackend {
  constructor(tableName, $httpBackend, userData, {countResponse, loadResponse, changeResponse, deleteResponse, saveResponse}) {
	//right now this is hardcoded when we had it dynamic
    var tableName = 'users';
    //peach does its check to get the count first
    this.countResponseHandler = $httpBackend.whenGET(/.*users\/count\?createdBefore=[0-9].*/);

    //then it starts loaded the first 'chunk'
    this.loadResponseHandler = $httpBackend.whenGET(/.*users\?createdBefore=[0-9].*/);

    //then it checks to see if anything changed since it started syncing
    this.changeResponseHandler = $httpBackend.whenGET(/.*users\?limit=.*&modifiedOrCreatedAfter=.*/);

    //then it checks to see if anything changed since it started syncing
    this.deleteResponseHandler = $httpBackend.whenDELETE(/.*users.*/);

    //saving a new item eh!
    this.saveResponseHandler = $httpBackend.whenPOST(/.*users.*/);

    this.countResponse = countResponse;
    this.loadResponse = loadResponse;
    this.changeResponse = changeResponse;
    this.deleteResponse = deleteResponse;
    this.saveResponse = saveResponse;
    this.setupUnhandled($httpBackend);
  }

  setupUnhandled($httpBackend) {
    $httpBackend.whenGET(new RegExp(`.*`, "g")).respond((method, url, callback, data)=> {
      console.error('Unhandled GET Response', method, url, callback, data);
    });
    $httpBackend.whenDELETE(new RegExp(`.*`, "g")).respond((method, url, callback, data)=> {
      console.error('Unhandled DELETE Response', method, url, callback, data);
    });
    $httpBackend.whenPOST(new RegExp(`.*`, "g")).respond((method, url, callback, data)=> {
      console.error('Unhandled POST Response', method, url, callback, data);
    });
  }

  get countResponse() {
    return this._countResponse;
  }

  set countResponse(r) {
    this._countResponse = r;
    this.countResponseHandler.respond(this._countResponse);
  }

  get loadResponse() {
    return this._loadResponse;
  }

  set loadResponse(r) {
    this._loadResponse = r;
    this.loadResponseHandler.respond(this._loadResponse);
  }

  get changeResponse() {
    return this._changeResponse;
  }

  set changeResponse(r) {
    this._changeResponse = r;
    this.changeResponseHandler.respond(this._changeResponse);
  }

  get deleteResponse() {
    return this._deleteResponse;
  }

  set deleteResponse(r) {
    this._deleteResponse = r;
    this.deleteResponseHandler.respond(this._deleteResponse);
  }

  get saveResponse() {
    return this._saveRespone;
  }

  set saveResponse(r) {
    this._saveRespone = r;
    this.saveResponseHandler.respond(this._saveRespone);
  }

  static service($httpBackend, userData) {
    let defaultResponses = {
      countResponse: {count: 3},
      loadResponse: userData,
      changeResponse: [],
      deleteResponse: [202]
    };

    return (tableName, responseConfig) => {
      //fancy way to do merge with es6
      const mergedOptions = { ...{}, ...defaultResponses, ...responseConfig };
      return new PeachMockBackend(tableName, $httpBackend, userData, mergedOptions);
    }
  }
}

angular.module('peachMock', ['peachData'])
  .service('peachMockBackend', PeachMockBackend.service);