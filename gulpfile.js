var gulp = require("gulp");
var clean = require('gulp-clean');
var ts = require("gulp-typescript");
var sourcemaps = require('gulp-sourcemaps');
var tsProject = ts.createProject("tsconfig.json");

gulp.task("clean-bin", function () {
  return gulp.src('bin', { read: false }).pipe(clean());
});

gulp.task("compile-ts", ["clean-bin"], function () {
  return tsProject
    .src()
    .pipe(sourcemaps.init())
    .pipe(tsProject()).js
    .pipe(sourcemaps.write("./", { includeContent: false, sourceRoot: '' }))
    .pipe(gulp.dest("./bin/"));
});

gulp.task("build", ["compile-ts"], function () {
});

gulp.task("default", ["build"], function () {
});