(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.engine = App.engine || {};

  const scanEngine = {
    ...(App.scan?.normalize || {}),
    ...(App.engine?.noteKey || {}),
    ...(App.report?.reportFormat || {}),
    ...(App.engine?.rules || {}),
    ...(App.scan?.blockBuilder || {}),
    ...(App.scan?.aggregator || {}),
    ...(App.io?.sheetsFetch || {}),
    ...(App.io?.pmsFetch || {}),
    ...(App.report?.validator || {}),
  };

  App.engine.scanEngine = scanEngine;
})();
