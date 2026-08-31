module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // three.js's build output uses static class blocks; babel-preset-expo
    // 54.0.12 doesn't transform that syntax on its own yet.
    plugins: ["@babel/plugin-transform-class-static-block"],
  };
};
