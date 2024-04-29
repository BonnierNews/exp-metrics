"use strict";

const proxyquire = require("proxyquire").noCallThru().noPreserveCache();
const request = require("supertest");
const express = require("express");
const nock = require("nock");
const { expect } = require("chai");

const mockResource = require("./helpers/mockResource.js");
const createHistogramSpy = spy({ record: spy() });
const createCounterSpy = spy({ add: spy() });

const expMetrics = proxyquire("..", {
  "@opentelemetry/sdk-metrics": {
    MeterProvider: function MeterProvider() {
      return {
        getMeter() {
          return {
            createHistogram: createHistogramSpy,
            createCounter: createCounterSpy,
          };
        },
      };
    },
    PeriodicExportingMetricReader: function () {},
  },
  "@opentelemetry/resources": mockResource,
});

Feature("middleware", () => {
  let app;
  let originalDateNow;

  before(() => {
    nock.enableNetConnect();
    originalDateNow = Date.now;
    const timeStamps = [ 100, 142, 200, 237 ];
    Date.now = () => timeStamps.shift() || originalDateNow();
  });

  after(() => {
    Date.now = originalDateNow;
  });

  Given("An Express app", () => {
    app = express();
  });

  When("the app is using our response time middleware", () => {
    const metrics = expMetrics("test-app");
    app.use(metrics.responseTimeMiddleware);
  });

  Then("a response time metric should have been created", () => {
    expect(createHistogramSpy.calls).to.deep.equal([ [ "http_response_time_milliseconds", { description: "Response times in milliseconds" } ] ]);
  });

  And("a response counter should have been created", () => {
    expect(createCounterSpy.calls).to.deep.equal([ [ "http_responses_total", { description: "Number of HTTP responses" } ] ]);
  });

  Given("the app has a route", () => {
    app.get("/path", (_req, res) => {
      res.send("Hello, world!");
    });
  });

  When("two requests are made to the Express app", async () => {
    await request(app).get("/path");
    await request(app).get("/path");
  });

  Then("the response time metric should have been called", () => {
    expect(createHistogramSpy.record.calls).to.deep.equal([
      [ 42 ],
      [ 37 ],
    ]);
  });

  And("the response time metric should have been called", () => {
    expect(createCounterSpy.add.calls).to.deep.equal([
      [ 1, { status_code: 200, method: "GET" } ],
      [ 1, { status_code: 200, method: "GET" } ],
    ]);
  });
});

function spy(props = {}) {
  function fakeFunction(...args) {
    fakeFunction.calls.push(args);
    return props;
  }

  Object.assign(fakeFunction, { calls: [] }, props);

  return fakeFunction;
}
