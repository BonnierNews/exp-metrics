"use strict";

const { expect } = require("chai");
const proxyquire = require("proxyquire").noCallThru().noPreserveCache();
const nock = require("nock");
const { InMemoryMetricExporter, AggregationTemporality, DataPointType } = require("@opentelemetry/sdk-metrics");

const { DiagLogLevel, diag } = require("@opentelemetry/api");
const fileLogger = require("./helpers/file-logger.js");
diag.setLogger(fileLogger, DiagLogLevel.DEBUG);

describe("metrics", () => {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  let metrics;

  before(() => {
    process.env.gcloud_project = "test-project";
    process.env.METADATA_SERVER_DETECTION = "none";

    const expMetrics = proxyquire("..", {
      "@opentelemetry/exporter-metrics-otlp-proto": {
        OTLPMetricExporter: function OTLPMetricExporter() {
          return exporter;
        },
      },
    });
    metrics = expMetrics("test-name", {
      "service.namespace": "test-namespace",
      "service.instance.id": "test-instance-id",
    });
  });

  after(() => {
    delete process.env.gcloud_project;
    delete process.env.METADATA_SERVER_DETECTION;
  });

  afterEach(() => {
    exporter.reset();
  });

  it("resource", async () => {
    metrics.counter({ name: "resource_counter" }).inc();

    await metrics.forceFlush();

    const { resource } = exporter.getMetrics().at(-1);
    expect(resource.attributes).to.include({
      "gcp.project_id": "test-project",
      "service.name": "test-name",
      "service.namespace": "test-namespace",
      "service.instance.id": "test-instance-id",
    });
  });

  it("counter", async () => {
    const counter = metrics.counter({
      name: "my_counter",
      help: "My counter",
    });

    counter.inc();
    counter.inc({ foo: "bar" }, 2);

    await metrics.forceFlush();

    const metric = getMetric("my_counter");
    expect(metric.descriptor).to.include({ description: "My counter" });
    expect(metric.dataPointType).to.equal(DataPointType.SUM);
    expect(metric.isMonotonic).to.equal(true);
    expect(getPoints(metric)).to.deep.equal([
      { attributes: {}, value: 1 },
      { attributes: { foo: "bar" }, value: 2 },
    ]);
  });

  it("gauge", async () => {
    const gauge = metrics.gauge({
      name: "my_gauge",
      help: "My gauge",
    });

    gauge.set({ foo: "bar" }, 5);
    gauge.inc({ foo: "bar" }); // 6
    gauge.inc(13); //            13
    gauge.dec(); //              12
    metrics.gauge({ name: "my_gauge" }).dec({ foo: "bar" }, 2); // 4

    await metrics.forceFlush();

    const metric = getMetric("my_gauge");
    expect(metric.descriptor).to.include({ description: "My gauge" });
    expect(metric.dataPointType).to.equal(DataPointType.GAUGE);
    expect(getPoints(metric)).to.deep.equal([
      { attributes: { foo: "bar" }, value: 4 },
      { attributes: {}, value: 12 },
    ]);
  });

  it("gauge keeps labels when the caller reuses the labels object", async () => {
    const gauge = metrics.gauge({ name: "reused_labels_gauge" });

    const labels = { queue: "a" };
    gauge.set(labels, 10);
    labels.queue = "b";
    gauge.set(labels, 20);

    await metrics.forceFlush();

    expect(getPoints(getMetric("reused_labels_gauge"))).to.deep.equal([
      { attributes: { queue: "a" }, value: 10 },
      { attributes: { queue: "b" }, value: 20 },
    ]);
  });

  it("returns separate instruments for different types with the same name", () => {
    const counter = metrics.counter({ name: "shared_name" });
    const gauge = metrics.gauge({ name: "shared_name" });

    expect(gauge).to.not.equal(counter);
    expect(gauge.set).to.be.a("function");
  });

  it("summary", async () => {
    const summary = metrics.summary({
      name: "my_summary",
      help: "My summary",
      percentiles: [ 0.5, 0.95, 0.99 ],
    });

    summary.observe({ foo: "bar" }, 10);
    summary.observe(20, { foo: "bar" });
    summary.observe(10);
    summary.observe(20);
    summary.observe(40);
    summary.observe(20);
    summary.observe(10);

    await metrics.forceFlush();

    const metric = getMetric("my_summary");
    expect(metric.descriptor).to.include({ description: "My summary" });
    expect(metric.dataPointType).to.equal(DataPointType.EXPONENTIAL_HISTOGRAM);
    expect(metric.dataPoints.map(({ attributes, value: { count, sum, min, max } }) => ({ attributes, count, sum, min, max }))).to.deep.equal([
      { attributes: { foo: "bar" }, count: 2, sum: 30, min: 10, max: 20 },
      { attributes: {}, count: 5, sum: 100, min: 10, max: 40 },
    ]);
  });

  it("summary with buckets", async () => {
    const summary = metrics.summary({
      name: "my_bucket_summary",
      buckets: [ 10, 100 ],
    });

    summary.observe(5);
    summary.observe(50);
    summary.observe(500);

    await metrics.forceFlush();

    const metric = getMetric("my_bucket_summary");
    expect(metric.dataPointType).to.equal(DataPointType.HISTOGRAM);
    expect(metric.dataPoints[0].value.buckets).to.deep.equal({ boundaries: [ 10, 100 ], counts: [ 1, 1, 1 ] });
  });

  function getMetric(name) {
    return findMetric(exporter, name);
  }
});

describe("buckets for all summaries", () => {
  let exporter;
  let expMetrics;

  before(() => {
    process.env.gcloud_project = "test-project";
    process.env.METADATA_SERVER_DETECTION = "none";
  });

  beforeEach(() => {
    exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    expMetrics = proxyquire("..", {
      "@opentelemetry/exporter-metrics-otlp-proto": {
        OTLPMetricExporter: function OTLPMetricExporter() {
          return exporter;
        },
      },
    });
  });

  after(() => {
    delete process.env.gcloud_project;
    delete process.env.METADATA_SERVER_DETECTION;
  });

  it("true uses the OpenTelemetry default buckets", async () => {
    const metrics = expMetrics("test-name", { buckets: true });
    metrics.summary({ name: "default_bucket_summary" }).observe(42);

    await metrics.forceFlush();

    const metric = findMetric(exporter, "default_bucket_summary");
    expect(metric.dataPointType).to.equal(DataPointType.HISTOGRAM);
    expect(metric.dataPoints[0].value.buckets.boundaries).to.deep.equal([ 0, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000 ]);
    await metrics.shutdown();
  });

  it("array is used unless the summary has its own buckets", async () => {
    const metrics = expMetrics("test-name", { buckets: [ 1, 2 ] });
    metrics.summary({ name: "service_bucket_summary" }).observe(1);
    metrics.summary({ name: "own_bucket_summary", buckets: [ 3, 4 ] }).observe(1);

    await metrics.forceFlush();

    expect(findMetric(exporter, "service_bucket_summary").dataPoints[0].value.buckets.boundaries).to.deep.equal([ 1, 2 ]);
    expect(findMetric(exporter, "own_bucket_summary").dataPoints[0].value.buckets.boundaries).to.deep.equal([ 3, 4 ]);
    await metrics.shutdown();
  });

  it("shutdown exports remaining metrics", async () => {
    const metrics = expMetrics("test-name");
    metrics.counter({ name: "shutdown_counter" }).inc();

    await metrics.shutdown();

    expect(getPoints(findMetric(exporter, "shutdown_counter"))).to.deep.equal([ { attributes: {}, value: 1 } ]);
  });
});

describe("export", () => {
  let metrics;

  before(() => {
    process.env.gcloud_project = "test-project";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "test/test-credentials";
    process.env.METADATA_SERVER_DETECTION = "none";

    nock.disableNetConnect();
    nock("https://oauth2.googleapis.com")
      .persist()
      .post("/token")
      .reply(200, { access_token: "test-token", expires_in: 3600 });

    const expMetrics = proxyquire("..", {});
    metrics = expMetrics("test-name");
  });

  after(() => {
    delete process.env.gcloud_project;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.METADATA_SERVER_DETECTION;
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it("sends OTLP protobuf to the Telemetry API with Google credentials", async () => {
    let headers;
    const scope = nock("https://telemetry.googleapis.com")
      .post("/v1/metrics")
      .reply(function reply() {
        headers = this.req.headers;
        return [ 200, "" ];
      });

    metrics.counter({ name: "exported_counter" }).inc();

    await metrics.forceFlush();

    expect(scope.isDone()).to.equal(true);
    expect(headers).to.include({
      authorization: "Bearer test-token",
      "content-type": "application/x-protobuf",
    });
  });

  it("splits exports into requests of at most 200 data points", async () => {
    const scope = nock("https://telemetry.googleapis.com")
      .post("/v1/metrics")
      .times(2)
      .reply(200, "");

    const counter = metrics.counter({ name: "batched_counter" });
    for (let i = 0; i < 201; i++) {
      counter.inc({ label: `value-${i}` });
    }

    await metrics.forceFlush();

    expect(scope.isDone()).to.equal(true);
  });

  it("does not export when disabled", async () => {
    const scope = nock("https://telemetry.googleapis.com")
      .post("/v1/metrics")
      .reply(200, "");

    const disabledMetrics = proxyquire("..", {})("test-name", { enabled: false });
    disabledMetrics.counter({ name: "disabled_counter" }).inc();

    await disabledMetrics.forceFlush();

    expect(scope.isDone()).to.equal(false);
  });
});

function findMetric(exporter, name) {
  const { scopeMetrics } = exporter.getMetrics().at(-1);
  return scopeMetrics.flatMap(({ metrics }) => metrics).find((metric) => metric.descriptor.name === name);
}

function getPoints(metric) {
  return metric.dataPoints.map(({ attributes, value }) => ({ attributes, value }));
}
