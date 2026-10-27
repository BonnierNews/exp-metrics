"use strict";

const { expect } = require("chai");
const proxyquire = require("proxyquire").noCallThru().noPreserveCache();
const { default: nock } = require("nock");
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
    gauge.inc(); //     6
    gauge.inc(13); //  19
    gauge.dec(); //    18
    gauge.dec(2); //   16

    await metrics.forceFlush();

    const metric = getMetric("my_gauge");
    expect(metric.descriptor).to.include({ description: "My gauge" });
    expect(metric.dataPointType).to.equal(DataPointType.GAUGE);
    expect(getPoints(metric)).to.deep.equal([
      { attributes: {}, value: 16 },
    ]);
  });

  it("summary", async () => {
    const summary = metrics.summary({
      name: "my_summary",
      help: "My summary",
      percentiles: [ 0.5, 0.95, 0.99 ],
    });

    summary.observe({ foo: "bar" }, 10);
    summary.observe({ foo: "bar" }, 20);
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

  function getMetric(name) {
    const { scopeMetrics } = exporter.getMetrics().at(-1);
    return scopeMetrics[0].metrics.find((metric) => metric.descriptor.name === name);
  }
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
    nock.enableNetConnect(/^(localhost|127\.0\.0\.1):\d+$/);
  });

  it("sends OTLP protobuf to the Telemetry API with Google credentials", async () => {
    let headers;
    const scope = nock("https://telemetry.googleapis.com")
      .post("/v1/metrics")
      .reply((request) => {
        headers = Object.fromEntries(request.headers);
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
});

function getPoints(metric) {
  return metric.dataPoints.map(({ attributes, value }) => ({ attributes, value }));
}
