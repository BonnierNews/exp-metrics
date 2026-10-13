"use strict";

const ctorArgs = [];

module.exports = {
  resourceFromAttributes: function (...args) {
    ctorArgs.push(...args);
    return { merge: function () { } };
  },
  detectResources: function () {
    return { merge: function () { } };
  },
  ctorArgs,
};
