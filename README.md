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

## Migrating from 3.x to 4.x

4.x replaces the deprecated Cloud Monitoring exporter with OTLP export to the Telemetry API. The JavaScript API is the same, but metric names and Google Cloud setup change.

### 1. Node.js 24

4.x requires Node.js >= 24.

### 2. Google Cloud setup

In every project the service exports metrics to:

```sh
gcloud services enable telemetry.googleapis.com --project <project>
gcloud projects add-iam-policy-binding <project> \
  --member serviceAccount:<service-account> \
  --role roles/telemetry.writer
```

Without these, exports fail and no metrics are written.

### 3. Dashboards and alerts

Metric names and the monitored resource change, so every dashboard, alert and SLO built on exp-metrics must be updated:

| Metric type | 3.x | 4.x |
| ----------- | --- | --- |
| Counter | `workload.googleapis.com/my_counter` | `prometheus.googleapis.com/my_counter/counter` |
| Gauge | `workload.googleapis.com/my_gauge` | `prometheus.googleapis.com/my_gauge/gauge` |
| Summary | `workload.googleapis.com/my_summary` | `prometheus.googleapis.com/my_summary/histogram` |

The monitored resource is `prometheus_target`. The 4.x metrics start empty when the service is deployed, history stays on the old `workload.googleapis.com` metrics.
Keep the old charts next to the new ones until the new metrics have enough history.

### 4. Code

- `percentiles` is ignored. It was used as histogram bucket boundaries, use `buckets` instead:
  ```javascript
  // 3.x
  metrics.summary({ name: "my_summary", percentiles: [ 10, 50, 100 ] });
  // 4.x
  metrics.summary({ name: "my_summary", buckets: [ 10, 50, 100 ] });
  ```
- A gauge reports one series per label set. In 3.x only the last used labels were reported, so a gauge that is set with changing labels now reports every label set it has seen, each with its last value.
- `summary.observe(0)` records 0. In 3.x it recorded 1.
- Call `metrics.shutdown()` on `SIGTERM` to export the last metrics before the process exits, see [Shutdown](#shutdown).
- Optional: use `enabled: false` in tests and local development instead of mocking exp-metrics.
