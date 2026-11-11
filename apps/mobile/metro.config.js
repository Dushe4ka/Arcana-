// Learn more: https://docs.expo.dev/guides/customizing-metro/
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The workspace also holds the admin and cabinet apps, which use a newer React. pnpm then
// nests that copy under some shared packages (zustand, use-sync-external-store), and Metro
// would bundle it next to the app's own React - two Reacts in one app crash on the first
// hook ("Cannot read property 'useCallback' of null"). Every import of react / react-dom
// is pinned to the single copy this app depends on.
const singletons = ["react", "react-dom"];
const resolveFrom = (name) => path.dirname(require.resolve(`${name}/package.json`, { paths: [__dirname] }));
const pinned = Object.fromEntries(singletons.map((name) => [name, resolveFrom(name)]));

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const root = singletons.find((name) => moduleName === name || moduleName.startsWith(`${name}/`));
  if (root) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(pinned[root], "package.json") },
      moduleName,
      platform,
    );
  }
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
