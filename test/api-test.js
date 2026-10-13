"use strict";

const crypto = require("crypto");
const proxyquire = require("proxyquire").noCallThru().noPreserveCache();
const { expect } = require("chai");
const sdkMetrics = require("@opentelemetry/sdk-metrics");

const mockMeterProvider = require("./helpers/mockMeterProvider.js");
const mockResource = require("./helpers/mockResource.js");

describe("API", () => {
  let expMetrics;
  let metrics;
  let randomUUID;

  beforeEach(() => {
    expMetrics = proxyquire("..", {
      "@opentelemetry/sdk-metrics": {
        ...sdkMetrics,
        MeterProvider: mockMeterProvider,
      },
      "@opentelemetry/resource-detector-gcp": mockResource,
      "@opentelemetry/resources": mockResource,
    });
  });

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

    it("no arguments", async () => {
      metrics = expMetrics();
      const { "gcp.project_id": projectId, ...attributes } = mockResource.ctorArgs.at(-1);
      expect(await projectId).to.equal("env-project");
      expect(attributes).to.deep.equal({
        "service.name": "exp-metrics",
        "service.namespace": "test",
        "service.instance.id": "random-uuid",
      });
    });

    it("only name", async () => {
      metrics = expMetrics("test-app");
      const { "gcp.project_id": projectId, ...attributes } = mockResource.ctorArgs.at(-1);
      expect(await projectId).to.equal("env-project");
      expect(attributes).to.deep.equal({
        "service.name": "test-app",
        "service.namespace": "test",
        "service.instance.id": "random-uuid",
      });
    });

    it("full config", () => {
      metrics = expMetrics("test-app", {
        "gcp.project_id": "project-override",
        "service.name": "name-override",
        "service.namespace": "namespace-override",
        "service.instance.id": "instance-override",
      });
      expect(mockResource.ctorArgs.at(-1)).to.deep.equal({
        "gcp.project_id": "project-override",
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
      gauge.set({ foo: "bar1" }, 2);

      gauge.inc(); // 2
      gauge.inc(10); // 12
      gauge.inc({ foo: "bar2" }); // 1
      gauge.inc({ foo: "bar3" }, 5); // 5

      gauge.dec(); // 11
      gauge.dec(10); // 1
      gauge.dec({ foo: "bar4" }); // -1
      gauge.dec({ foo: "bar5" }, 3); // -3

      gauge.set({ foo: "bar2" }, 0);
      cl();

      expect(gauge.metric.calls).to.deep.equal([
        [ 1, {} ],
        [ 2, { foo: "bar1" } ],
        [ 0, { foo: "bar2" } ],
        [ 5, { foo: "bar3" } ],
        [ -1, { foo: "bar4" } ],
        [ -3, { foo: "bar5" } ],
      ]);

      const gauge2 = metrics.gauge({ name: "my_gauge_2" });
      expect(gauge2.metric.ctorArgs).to.deep.equal([ "my_gauge_2", {} ]);
    });

    it("summary", () => {
      const summary = metrics.summary({
        name: "my_summary",
        help: "My summary",
        buckets: [ 10, 100, 1000 ],
        percentiles: [ 0.5, 0.95, 0.99 ],
        invalidPropetry: "invalid",
      });
      expect(summary.metric).to.deep.equal([
        "my_summary",
        {
          description: "My summary",
          advice: { explicitBucketBoundaries: [ 10, 100, 1000 ] },
        },
      ]);

      const records = [];
      summary.metric.record = (...args) => {
        records.push(args);
      };

      summary.observe();
      summary.observe(1);
      summary.observe(0);
      summary.observe({ foo: "bar" }, 2);
      summary.observe({ foo: "bar" }, 0);
      summary.observe(3, { foo: "bar" });

      expect(records).to.deep.equal([
        [ 1, {} ],
        [ 1, {} ],
        [ 0, {} ],
        [ 2, { foo: "bar" } ],
        [ 0, { foo: "bar" } ],
        [ 3, { foo: "bar" } ],
      ]);
    });

    it("returns the same instrument for the same name", () => {
      expect(metrics.counter({ name: "same_counter" })).to.equal(metrics.counter({ name: "same_counter" }));
      expect(metrics.gauge({ name: "same_gauge" })).to.equal(metrics.gauge({ name: "same_gauge" }));
      expect(metrics.summary({ name: "same_summary" })).to.equal(metrics.summary({ name: "same_summary" }));
    });
  });
});
