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
  - `observe([labels,] value)`


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

For overriding the default OpenTelemetry configuration, see the [OpenTelemetry documentation](https://www.npmjs.com/package/@opentelemetry/resources)

## Google Cloud

Metrics are exported every 60 seconds over OTLP to the [Google Cloud Telemetry API](https://docs.cloud.google.com/stackdriver/docs/reference/telemetry/overview),
authenticated with Application Default Credentials. The project is resolved from the credentials (or `GOOGLE_CLOUD_PROJECT`),
and can be overridden with `"gcp.project_id"` in the config.

Requirements:
- The Telemetry API is enabled: `gcloud services enable telemetry.googleapis.com`
- The service account has the `roles/telemetry.writer` role

Metrics show up in Cloud Monitoring as `prometheus.googleapis.com/<name>/<counter|gauge|histogram>` on the `prometheus_target` resource,
e.g. `prometheus.googleapis.com/http_responses_total/counter`.
