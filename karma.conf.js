// Karma configuration
// Generated on Mon Apr 13 2015 11:41:58 GMT-0500 (CDT)

module.exports = function(config) {
  config.set({

    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: [
      'jasmine',
      'jasmine-matchers',
    ],

    // list of files / patterns to load in the browser
    files: [
      'node_modules/babel-core/browser-polyfill.js',
      'bower_components/bluebird/js/browser/bluebird.js',
      'bower_components/pouchdb/dist/pouchdb.js',
      'bower_components/pouchdb-find/dist/pouchdb.find.min.js',
      'bower_components/lodash/lodash.min.js',
      'bower_components/angular/angular.min.js',
      'bower_components/angular-mocks/angular-mocks.js',
      'bower_components/angular-cookies/angular-cookies.js',
      'bower_components/restangular/dist/restangular.js',
      'bower_components/angular-pouchdb/angular-pouchdb.js',
      'bower_components/upsert/dist/pouchdb.upsert.js',

      'src/pouchdb.fruitdown.js',
      'dist/peachdb.js',
      'test/**/*.mock.js',
      'test/**/*.spec.js',
    ],
    preprocessors: {
      // 'src/**/*.js': ['babel', 'sourcemap'],
      'test/**/*.js': ['babel', 'sourcemap'],
    },
    babelPreprocessor: {
      options: {
        loose: 'all',
        stage: 0,
      },
    },
    reporters: ['progress'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    singleRun: false,
    browsers: ['Chrome'],
  });
};
