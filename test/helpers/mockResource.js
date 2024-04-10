"use strict";

const ctorArgs = [];

module.exports = {
  Resource: function (...args) {
    ctorArgs.push(...args);
    return { merge: function () { } };
  },
  ctorArgs,
};
