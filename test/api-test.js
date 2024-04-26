"use strict";

const crypto = require("crypto");
const proxyquire = require("proxyquire").noCallThru().noPreserveCache();
const { expect } = require("chai");

const mockMeterProvider = require("./helpers/mockMeterProvider.js");
const mockResource = require("./helpers/mockResource.js");

const expMetrics = proxyquire("..", {
  "@opentelemetry/sdk-metrics": {
    MeterProvider: mockMeterProvider,
    PeriodicExportingMetricReader: function () {},
  },
  "@opentelemetry/resources": mockResource,
});

describe("API", () => {
  let metrics;
  let randomUUID;

  describe("initialization", () => {
    before(() => {
      process.env.GOOGLE_CLOUD_PROJECT = "env-project";
      randomUUID = crypto.randomUUID;
      crypto.randomUUID = () => "random-uuid";
    });

    after(() => {
      delete process.env.GOOGLE_CLOUD_PROJECT;
      crypto.randomUUID = randomUUID;
    });

    it("no arguments", () => {
      metrics = expMetrics();
      expect(mockResource.ctorArgs.at(-1)).to.deep.equal({
        "service.name": "exp-metrics",
        "service.namespace": "test",
        "service.instance.id": "random-uuid",
      });
    });

    it("only name", () => {
      metrics = expMetrics("test-app");
      expect(mockResource.ctorArgs.at(-1)).to.deep.equal({
        "service.name": "test-app",
        "service.namespace": "test",
        "service.instance.id": "random-uuid",
      });
    });

    it("full config", () => {
      metrics = expMetrics("test-app", {
        "service.name": "name-override",
        "service.namespace": "namespace-override",
        "service.instance.id": "instance-override",
      });
      expect(mockResource.ctorArgs.at(-1)).to.deep.equal({
        "service.name": "name-override",
        "service.namespace": "namespace-override",
        "service.instance.id": "instance-override",
      });
    });
  });

  describe("metrics", () => {
    before(() => {
      metrics = expMetrics("test-app");
    });

    it("counter", () => {
      const counter = metrics.counter({
        name: "my_counter",
        help: "My counter",
        unit: "My unit",
        valueType: "My valueType",
        invalidPropetry: "invalid",
      });
      expect(counter.metric).to.deep.equal([
        "my_counter",
        {
          description: "My counter",
          unit: "My unit",
          valueType: "My valueType",
        },
      ]);

      const adds = [];
      counter.metric.add = (...args) => {
        adds.push(args);
      };

      counter.inc();
      counter.inc(2);
      counter.inc({ foo: "bar" }, 3);
      counter.inc({ boo: "far" });

      expect(adds).to.deep.equal([
        [ 1, {} ],
        [ 2, {} ],
        [ 3, { foo: "bar" } ],
        [ 1, { boo: "far" } ],
      ]);

      const counter2 = metrics.counter({ name: "my_counter_2" });
      expect(counter2.metric).to.deep.equal([ "my_counter_2", {} ]);
    });

    it("gauge", () => {
      const gauge = metrics.gauge({
        name: "my_gauge",
        help: "My gauge",
        unit: "My unit",
        valueType: "My valueType",
        invalidPropetry: "invalid",
      });
      expect(gauge.metric.ctorArgs).to.deep.equal([
        "my_gauge",
        {
          description: "My gauge",
          unit: "My unit",
          valueType: "My valueType",
        },
      ]);

      const { mockCollect: cl } = gauge.metric;

      gauge.set(1);
      cl();
      gauge.set({ foo: "bar1" }, 2);
      cl();

      gauge.inc(); // 3
      cl();
      gauge.inc(10); // 13
      cl();
      gauge.inc({ foo: "bar2" }); // 14
      cl();
      gauge.inc({ foo: "bar3" }, 5); // 19
      cl();

      gauge.dec(); // 18
      cl();
      gauge.dec(10); // 8
      cl();
      gauge.dec({ foo: "bar4" }); // 7
      cl();
      gauge.dec({ foo: "bar5" }, 3); // 4
      cl();

      gauge.set(0);
      cl();

      expect(gauge.metric.calls).to.deep.equal([
        [ 1, {} ],
        [ 2, { foo: "bar1" } ],
        [ 3, {} ],
        [ 13, {} ],
        [ 14, { foo: "bar2" } ],
        [ 19, { foo: "bar3" } ],
        [ 18, {} ],
        [ 8, {} ],
        [ 7, { foo: "bar4" } ],
        [ 4, { foo: "bar5" } ],
        [ 0, {} ],
      ]);

      const gauge2 = metrics.gauge({ name: "my_gauge_2" });
      expect(gauge2.metric.ctorArgs).to.deep.equal([ "my_gauge_2", {} ]);
    });

    it("summary", () => {
      const summary = metrics.summary({
        name: "my_summary",
        help: "My summary",
        percentiles: [ 0.5, 0.95, 0.99 ],
        invalidPropetry: "invalid",
      });
      expect(summary.metric).to.deep.equal([
        "my_summary",
        {
          description: "My summary",
          advice: { explicitBucketBoundaries: [ 0.5, 0.95, 0.99 ] },
        },
      ]);

      const records = [];
      summary.metric.record = (...args) => {
        records.push(args);
      };

      summary.observe();
      summary.observe(1);
      summary.observe({ foo: "bar" }, 2);

      expect(records).to.deep.equal([
        [ undefined ],
        [ 1 ],
        [ 2, { foo: "bar" } ],
      ]);
    });
  });
});
