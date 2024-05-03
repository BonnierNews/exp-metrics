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
