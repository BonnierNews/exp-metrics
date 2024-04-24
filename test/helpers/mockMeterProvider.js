"use strict";

module.exports = function mockMeterProvider() {
  return {
    getMeter() {
      return {
        createCounter: createMetric,
        createObservableGauge,
        createHistogram: createMetric,
      };
    },
  };
};

function createMetric(...args) {
  return args;
}

function createObservableGauge(...ctorArgs) {
  const calls = [];
  let callback;

  return {
    ctorArgs,
    calls,
    addCallback(cb) {
      callback = cb;
    },
    mockCollect() {
      callback({
        observe(...observeAargs) {
          calls.push(observeAargs);
        },
      });
    },
  };
}
