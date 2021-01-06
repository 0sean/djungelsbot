const { task, src, dest, series } = require("gulp"), ts = require("gulp-typescript"), eslint = require("gulp-eslint"), del = require("del");

const tsp = ts.createProject("tsconfig.json");

task("clean", () => {
    return del("build/**/*");
});

task("build", () => {
    return tsp.src().pipe(tsp()).js.pipe(dest("build"));
});

task("lint", () => {
    return src("src/**/*").pipe(eslint()).pipe(eslint.format()).pipe(eslint.failAfterError());
});

task("move", () => {
    return src("src/countries.json").pipe(dest("build"));
})

task("dev", series("lint", "clean", "move", "build"));
task("default", series("clean", "move", "build"));