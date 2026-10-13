# exp-metrics

[![Run tests](https://github.com/BonnierNews/exp-metrics/actions/workflows/run-tests.yml/badge.svg)](https://github.com/BonnierNews/exp-metrics/actions/workflows/run-tests.yml)

Simple wrapper of [OpenTelemetry](https://github.com/open-telemetry/opentelemetry-js) metrics with the same API as [prom-client](https://www.npmjs.com/package/prom-client),
to make the transition from `prom-client` easy, and also add functionality that
OpenTelemetry lacks.


## Types of metrics and API

- Counter
  - `inc([labels,] [value])`
- Gauge
  - `set([labels,] value)`
  - `inc([labels,] [value])`
  - `dec([labels,] [value])`
- Summary (histogram in OpenTelemetry terms)
  - `observe([labels,] value)` or `observe(value[, labels])`

Creating a metric with a name that already exists returns the existing metric, so `metrics.counter({ name: "x" })` is safe to call per request.

A gauge keeps one value per label set, i.e. `gauge.set({ queue: "a" }, 1)` and `gauge.set({ queue: "b" }, 2)` are reported as two series.


## Installing

```sh
npm install @bonniernews/exp-metrics
```


## Usage


```javascript
const expMetrics = require("@bonniernews/exp-metrics");

metrics = expMetrics("my-service-name", {
  // optional overrides, see more below
});

const myCounter = metrics.counter({
  name: "my_counter",
  help: "My counter",
})

myCounter.inc(2);
myCounter.inc({ foo: "bar" }, 3);

```

See more in the [prom-client](https://github.com/siimon/prom-client?tab=readme-ov-file#custom-metrics) documentation.

TypeScript types are included.

### Options

- `enabled` (default `true`): `false` keeps the same API but exports nothing and never calls Google Cloud, e.g. for tests and local development
- `buckets`: explicit histogram buckets for every summary, see [Histogram buckets](#histogram-buckets)

Any other key is set as an OpenTelemetry resource attribute, overriding the defaults (`gcp.project_id`, `service.name`, `service.namespace`, `service.instance.id`).
See the [OpenTelemetry documentation](https://www.npmjs.com/package/@opentelemetry/resources).

### Histogram buckets

Summaries are exported as exponential histograms by default. They have fine resolution per series,
but every series picks its own bucket layout, so percentiles aggregated across series (e.g. p95 over all instances) in Cloud Monitoring can be very coarse.

Explicit buckets give every series the same layout, so they aggregate exactly, with a precision of the bucket width:

```javascript
// one summary
metrics.summary({ name: "my_summary", buckets: [ 10, 50, 100, 250, 500, 1000 ] });

// every summary, including http_response_time_milliseconds
// true = OpenTelemetry defaults [ 0, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000 ]
expMetrics("my-service-name", { buckets: true });
expMetrics("my-service-name", { buckets: [ 10, 50, 100, 250, 500, 1000 ] });
```

Summaries with their own `buckets` are exported with the instrumentation scope `exp-metrics-buckets` instead of `exp-metrics`.

### Shutdown

Metrics are exported every 60 seconds. Flush the remaining metrics before the process exits:

```javascript
process.on("SIGTERM", async () => {
  await metrics.shutdown();
  process.exit(0);
});
```

## Google Cloud

Metrics are exported every 60 seconds over OTLP to the [Google Cloud Telemetry API](https://docs.cloud.google.com/stackdriver/docs/reference/telemetry/overview),
authenticated with Application Default Credentials. The project is resolved from the credentials (or `GOOGLE_CLOUD_PROJECT`),
and can be overridden with `"gcp.project_id"` in the config.

Requirements:
- The Telemetry API is enabled: `gcloud services enable telemetry.googleapis.com`
- The service account has the `roles/telemetry.writer` role

Metrics show up in Cloud Monitoring as `prometheus.googleapis.com/<name>/<counter|gauge|histogram>` on the `prometheus_target` resource,
e.g. `prometheus.googleapis.com/http_responses_total/counter`.
