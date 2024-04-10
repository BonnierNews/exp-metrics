"use strict";

module.exports = function removeNock(scope) {
  const keys = Object.keys(scope.keyedInterceptors);
  keys.forEach((key) => {
    scope.remove(key, scope.keyedInterceptors[key]);
  });
};
