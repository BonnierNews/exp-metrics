"use strict";

const ctorArgs = [];

module.exports = {
  Resource: function (...args) {
    ctorArgs.push(...args);
    return { merge: function () { } };
  },
  detectResourcesSync: function () {
    return { merge: function () { } };
  },
  ctorArgs,
};
