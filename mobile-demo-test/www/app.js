'use strict';

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var PeachCtrl = (function () {
  function PeachCtrl(peachDB, RoomService, Couriers) {
    var _this = this;

    _classCallCheck(this, PeachCtrl);

    this.searchOptions = {
      selector: { name: 'Mario' },
      fields: ['_id', 'name'],
      sort: ['name']
    };

    this.users = peachDB('users', 'firstName,lastName');
    this.users.db.createIndex({
      index: {
        fields: ['name']
      }
    });
    this.mailItems = peachDB('mail/items');
    this.roomPeach = RoomService.peach;
    Couriers.peach.all().then(function (couriers) {
      _this.couriers = couriers;
    });
  }

  _createClass(PeachCtrl, [{
    key: 'loadUsers',
    value: function loadUsers() {
      this.users.load();
    }
  }, {
    key: 'getUser',
    value: function getUser() {
      this.users.getById(14725).then(function (user) {
        console.log(user, user.rev, 'gotta  user?');
      });
    }
  }, {
    key: 'modifyUser',
    value: function modifyUser() {
      var _this2 = this;

      this.users.getById(14720).then(function (user) {
        console.log(user, user.rev, 'gotta  user?');
        user.firstName = 'blag';
        _this2.users.save(user);
      });
    }
  }, {
    key: 'sync',
    value: function sync() {
      this.users.sync();
    }
  }, {
    key: 'destroy',
    value: function destroy() {
      this.users.db.destroy();
    }
  }, {
    key: 'search',
    value: function search(name) {
      var _this3 = this;

      if (name !== null && name !== "") {
        this.users.searchByName(name).then(function (users) {
          return _this3.results = users;
        });
      }
    }
  }, {
    key: 'query',
    value: function query(options) {
      var _this4 = this;

      console.log('i be querying');
      this.users.find(options).then(function (users) {
        console.log('yay', users);_this4.results = users;
      });
    }
  }, {
    key: 'searchRooms',
    value: function searchRooms(name) {
      var _this5 = this;

      if (name !== null && name !== "") {
        this.roomPeach.searchByName(name).then(function (rooms) {
          return _this5.roomResults = rooms;
        });
      }
    }
  }, {
    key: 'loadMailItems',
    value: function loadMailItems() {
      var _this6 = this;

      this.mailItems.sync().then(function () {
        return _this6.mailItems.getById(3080).then(function (r) {
          return _this6.allMailItems = r;
        });
      });
    }
  }]);

  return PeachCtrl;
})();

var app = angular.module('peachdemo', ['restangular', 'ngPrettyJson', 'peach']);
app.controller('PeachCtrl', PeachCtrl);
app.config(function (RestangularProvider) {
  var _site, _username, _password;
  try {
    var values = window.localStorage.getItem('auth-dev').split(',');
    _site = values[0];
    _username = values[1];
    _password = values[2];
  } catch (e) {
    console.error("Update your local storage with the key `auth-dev` with a value of `site,user,password`");
    _username = 'ioffice';
    _password = 'kenton';
    _site = 'http://kgray.corp.iofficecorp.com:8080';
  }
  RestangularProvider.setDefaultHeaders({
    'x-auth-username': _username,
    'x-auth-password': _password
  });
  RestangularProvider.setBaseUrl(_site + '/external/api/rest/v2/');
  RestangularProvider.setRestangularFields({
    route: '$route'
  });
});

var ROOM_SELECTOR = 'description,longDescription,capacity,' + 'type(color(red,green,blue)),' + 'floor(building(longitude,latitude,address(state(code),street,city))),' + 'assets(model(manufacturer(company))),' + 'image(small,medium,large,smallSquare),attachments(image,images(small,medium,large,smallSquare))';

var RoomService = (function (_PeachModel) {
  _inherits(RoomService, _PeachModel);

  function RoomService(peachDB) {
    _classCallCheck(this, RoomService);

    _get(Object.getPrototypeOf(RoomService.prototype), 'constructor', this).call(this, peachDB, "rooms", ROOM_SELECTOR);
    this.peach = peachDB('rooms', ROOM_SELECTOR, true);
  }

  return RoomService;
})(PeachModel);

app.factory('RoomService', PeachModel.factory(RoomService));

var CourierService = (function () {
  function CourierService(peachDB) {
    _classCallCheck(this, CourierService);

    this.peach = peachDB('mail/couriers', null, true);
  }

  _createClass(CourierService, null, [{
    key: 'factory',
    value: function factory(peachDB) {
      return new CourierService(peachDB);
    }
  }]);

  return CourierService;
})();

app.factory('Couriers', CourierService.factory);