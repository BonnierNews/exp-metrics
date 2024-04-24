"use strict";

const { expect } = require("chai");
const expMetrics = require("..");
const nock = require("nock");
const removeNock = require("./helpers/removeNock.js");
const testRequestBody = require("./helpers/testRequestBody.js");

const { DiagLogLevel, diag } = require("@opentelemetry/api");
const fileLogger = require("./helpers/file-logger.js");
diag.setLogger(fileLogger, DiagLogLevel.DEBUG);

const requests = [];
const requestPromises = [];
const metricsEndpoint = nock("https://monitoring.googleapis.com");

describe("metrics", () => {
  let metrics;

  before(() => {
    process.env.gcloud_project = "test-project";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "test/test-credentials";

    nock.disableNetConnect();
    nock("https://www.googleapis.com/oauth2")
      .persist()
      .post("/v4/token")
      .reply(200, {});

    metrics = expMetrics("test-name", {
      "service.namespace": "test-namespace",
      "service.instance.id": "test-instance-id",
    });
  });

  afterEach(() => {
    removeNock(metricsEndpoint);
    requests.length = 0;
  });

  it("counter", async () => {
    const counter = metrics.counter({
      name: "my_counter",
      help: "My counter",
    });

    expectedMetricDescriptorsRequest({
      type: "workload.googleapis.com/my_counter",
      description: "My counter",
      displayName: "my_counter",
      metricKind: "CUMULATIVE",
      valueType: "DOUBLE",
      unit: "",
      labels: [],
    });

    expectedTimeSeriesRequest("my_counter", {
      timeSeries: [
        {
          metric: {
            type: "workload.googleapis.com/my_counter",
            labels: {},
          },
          resource: {
            type: "generic_task",
            labels: {
              location: "global",
              namespace: "test-namespace",
              job: "test-name",
              task_id: "test-instance-id",
            },
          },
          metricKind: "CUMULATIVE",
          valueType: "DOUBLE",
          points: [
            { value: { doubleValue: 1 } },
          ],
        },
        {
          metric: {
            type: "workload.googleapis.com/my_counter",
            labels: { foo: "bar" },
          },
          resource: {
            type: "generic_task",
            labels: {
              location: "global",
              namespace: "test-namespace",
              job: "test-name",
              task_id: "test-instance-id",
            },
          },
          metricKind: "CUMULATIVE",
          valueType: "DOUBLE",
          points: [
            { value: { doubleValue: 2 } },
          ],
        },
      ],
    });

    counter.inc();
    counter.inc({ foo: "bar" }, 2);

    await metrics.forceFlush();

    await expectRequests();
  });

  it("gauge", async () => {
    const gauge = metrics.gauge({
      name: "my_gauge",
      help: "My gauge",
    });

    expectedMetricDescriptorsRequest({
      type: "workload.googleapis.com/my_gauge",
      description: "My gauge",
      displayName: "my_gauge",
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      unit: "",
      labels: [],
    });

    expectedTimeSeriesRequest("my_gauge", {
      timeSeries: [
        {
          metric: {
            type: "workload.googleapis.com/my_gauge",
            labels: {},
          },
          resource: {
            type: "generic_task",
            labels: {
              location: "global",
              namespace: "test-namespace",
              job: "test-name",
              task_id: "test-instance-id",
            },
          },
          metricKind: "GAUGE",
          valueType: "DOUBLE",
          points: [
            { value: { doubleValue: 16 } },
          ],
        },
      ],
    });

    gauge.set({ foo: "bar" }, 5);
    gauge.inc(); //     6
    gauge.inc(13); //  19
    gauge.dec(); //    18
    gauge.dec(2); //   16

    await metrics.forceFlush();

    await expectRequests();
  });

  it("summary", async () => {
    const summary = metrics.summary({
      name: "my_summary",
      help: "My summary",
      percentiles: [ 0.5, 0.95, 0.99 ],
    });

    expectedMetricDescriptorsRequest({
      type: "workload.googleapis.com/my_summary",
      description: "My summary",
      displayName: "my_summary",
      metricKind: "CUMULATIVE",
      valueType: "DISTRIBUTION",
      unit: "",
      labels: [],
    });

    expectedTimeSeriesRequest("my_summary", {
      timeSeries: [
        {
          metric: {
            type: "workload.googleapis.com/my_summary",
            labels: { foo: "bar" },
          },

          resource: {
            type: "generic_task",
            labels: {
              location: "global",
              namespace: "test-namespace",
              job: "test-name",
              task_id: "test-instance-id",
            },
          },
          metricKind: "CUMULATIVE",
          valueType: "DISTRIBUTION",
          points: [
            {
              value: {
                distributionValue: {
                  count: "2",
                  mean: 15,
                  bucketOptions: {
                    explicitBuckets: {
                      bounds: [
                        0.5,
                        0.95,
                        0.99,
                      ],
                    },
                  },
                  bucketCounts: [
                    "0",
                    "0",
                    "0",
                    "2",
                  ],
                },
              },
            },
          ],
        },
        {
          metric: { type: "workload.googleapis.com/my_summary" },
          points: [
            {
              value: {
                distributionValue: {
                  count: "5",
                  mean: 20,
                },
              },
            },
          ],
        },
      ],
    });

    summary.observe({ foo: "bar" }, 10);
    summary.observe({ foo: "bar" }, 20);
    summary.observe(10);
    summary.observe(20);
    summary.observe(40);
    summary.observe(20);
    summary.observe(10);

    await metrics.forceFlush();

    await expectRequests();
  });
});

function expectedMetricDescriptorsRequest(expected) {
  expectedRequest("/v3/projects/test-project/metricDescriptors", expected);
}

function expectedTimeSeriesRequest(name, expected) {
  expectedRequest("/v3/projects/test-project/timeSeries", expected, name, filterTimeSeries);
}

function expectedRequest(route, expected, name, filterFunction = (body) => body) {
  requestPromises.push(new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`The route "${route}" was never reqested`));
    }, 1000);

    metricsEndpoint.post(route, (body) => {
      requests.push({
        expected,
        body: filterFunction(body, name),
      });

      clearTimeout(timeout);
      resolve();
      return true;
    })
      .reply(200, {});
  }));
}

function filterTimeSeries(body, name) {
  return {
    ...body,
    timeSeries: body.timeSeries.filter((item) => {
      return item.metric.type.endsWith(name);
    }),
  };
}

async function expectRequests() {
  await Promise.all(requestPromises);

  requests.forEach(({ expected, body }) => {
    testRequestBody(expected, body);
  });

  expect(metricsEndpoint.pendingMocks()).to.deep.equal([]);
  requests.length = 0;
}
