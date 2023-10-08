'use strict';
class PeachCtrl {
  constructor(peachDB, RoomService, Couriers) {
    this.searchOptions ={
      selector: {name: 'Mario'},
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
    Couriers.peach.all().then((couriers)=> {
      this.couriers = couriers;
    });
  }

  loadUsers() {
    this.users.load();
  }

  getUser() {
    this.users.getById(14725).then((user) => {
      console.log(user, user.rev, 'gotta  user?');
    });
  }

  modifyUser() {
    this.users.getById(14720).then((user) => {
      console.log(user, user.rev, 'gotta  user?');
      user.firstName = 'blag';
      this.users.save(user);
    });
  }

  sync() {
    this.users.sync();
  }

  destroy() {
    this.users.db.destroy();
  }

  search(name) {
    if (name !== null && name !== "") {
      this.users.searchByName(name).then((users)=> this.results = users);
    }
  }

  query(options) {
    console.log('i be querying');
    this.users.find(options).then(users => { console.log('yay', users); this.results = users } );
  }

  searchRooms(name) {
    if (name !== null && name !== "") {
      this.roomPeach.searchByName(name).then((rooms) => this.roomResults = rooms);
    }
  }
  loadMailItems() {
    this.mailItems.sync().then(() => this.mailItems.getById(3080).then(r => this.allMailItems = r));
  }
}


var app = angular.module('peachdemo', ['restangular', 'ngPrettyJson', 'peach']);
app.controller('PeachCtrl', PeachCtrl);
app.config(function(RestangularProvider) {
  var _site, _username, _password;
  try {
    var values = window.localStorage.getItem('auth-dev').split(',');
    _site = values[0];
    _username = values[1];
    _password = values[2];
  } catch(e) {
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


const ROOM_SELECTOR = 'description,longDescription,capacity,' +
  'type(color(red,green,blue)),' +
  'floor(building(longitude,latitude,address(state(code),street,city))),' +
  'assets(model(manufacturer(company))),' +
  'image(small,medium,large,smallSquare),attachments(image,images(small,medium,large,smallSquare))';

class RoomService extends PeachModel {
  constructor(peachDB) {
    super(peachDB, "rooms", ROOM_SELECTOR);
    this.peach = peachDB('rooms', ROOM_SELECTOR, true);
  }

}

app.factory('RoomService', PeachModel.factory(RoomService));

class CourierService {
  constructor(peachDB) {
    this.peach = peachDB('mail/couriers', null, true);
  }

  static factory(peachDB) {
    return new CourierService(peachDB);
  }
}

app.factory('Couriers', CourierService.factory);