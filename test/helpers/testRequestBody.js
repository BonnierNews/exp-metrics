"use strict";

const { expect } = require("chai");

module.exports = function testRequestBody(testNode, actualNode, path = "body") {
  Object.keys(testNode).forEach((key) => {
    const current = testNode[key];
    if (typeof current === "object") {
      testRequestBody(current, actualNode[key], `${path}.${key}`);
    } else {
      expect(actualNode[key], `Request mismatch on ${path}.${key}`).to.equal(testNode[key]);
    }
  });

  return true;
};
