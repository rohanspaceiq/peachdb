var gulp = require('gulp');
var gulpif = require('gulp-if');
var gulpFilter = require('gulp-filter');
var babel = require('gulp-babel');
var lazypipe = require('lazypipe');
var rename = require("gulp-rename");
var merge = require('merge-stream');
var runSequence = require('run-sequence');
var rimraf = require('rimraf');
var connect = require('gulp-connect');

var paths = {
  js: 'src/**/*.js',
  demoJs: 'demo/**/*.js',
  html: 'demo/**/*.html'
};

gulp.task('js', function() {
  //var filter = gulpFilter('**/peachdb.js');

  return gulp.src([paths.js])
    .pipe(babel({
      stage: 0
    }))
    .pipe(gulp.dest('dist'))
    .pipe(connect.reload());
});

gulp.task('html', function() {
  return gulp.src(paths.html)
    .pipe(gulp.dest('demo'))
    .pipe(connect.reload());
});

gulp.task('connect', function() {
  connect.server({
    port: 1337,
    root: ['demo'],
    livereload: true
  });
});

gulp.task('build-demo', ['js'], function() {
  //var jsFilter = gulpFilter('**/*.es6.js');
  return merge(
    gulp.src(['**/*.es6.js'])
      .pipe(babel())
      .pipe(rename('app.js'))
      .pipe(gulp.dest('demo'))
      .pipe(gulp.dest('mobile-demo-test/www'))
      .pipe(connect.reload()),
    gulp.src('dist/peachdb.js')
      .pipe(gulp.dest('demo')))
    .pipe(gulp.dest('mobile-demo-test/www'))
    .pipe(connect.reload());
});

gulp.task('clean', function(cb) {
  rimraf('./dist/*.*', cb);
});

gulp.task('watch', function() {
  gulp.watch([paths.js, paths.demoJs, paths.html], ['build-demo']);
});

gulp.task('default', function(cb) {
  runSequence('clean', 'js', 'build-demo', 'connect', 'watch', cb);
});
