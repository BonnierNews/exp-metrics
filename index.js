"use strict";

const { DiagConsoleLogger, DiagLogLevel, diag } = require("@opentelemetry/api");
const { MetricExporter } = require("@google-cloud/opentelemetry-cloud-monitoring-exporter");
const { MeterProvider, PeriodicExportingMetricReader, InstrumentType, ExponentialHistogramAggregation, View } = require("@opentelemetry/sdk-metrics");
const { Resource } = require("@opentelemetry/resources");
const { GcpDetectorSync } = require("@google-cloud/opentelemetry-resource-util");
const crypto = require("crypto");
const onFinished = require("on-finished");

let meter;
let reader;
let responseCodes;
let responseTime;

module.exports = function expMetrics(applicationName = "exp-metrics", config = {}) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  const metrics = {
    counter(metricConfig) {
      const metric = meter.createCounter(...getOtConfig(metricConfig));
      return {
        metric,
        inc(...args) {
          const { delta, attrs } = getParams(args);
          return metric.add(delta, attrs);
        },
      };
    },
    gauge(metricConfig) {
      let value = 0;
      let attributes = {};
      const metric = meter.createObservableGauge(...getOtConfig(metricConfig));
      metric.addCallback((result) => {
        result.observe(value, attributes);
      });

      return {
        metric,
        set(...args) {
          const { delta, attrs } = getParams(args);
          value = delta;
          attributes = attrs;
        },
        inc(...args) {
          const { delta, attrs } = getParams(args);
          value += delta;
          attributes = attrs;
        },
        dec(...args) {
          const { delta, attrs } = getParams(args);
          value -= delta;
          attributes = attrs;
        },
      };
    },
    summary(metricConfig) {
      const metric = meter.createHistogram(...getOtConfig(metricConfig));
      return {
        metric,
        observe(...args) {
          console.log("monitoring args:", args);
          if (args.length > 1) {
            return metric.record(args[1], args[0]);
          }
          return metric.record(args[0]);
        },
      };
    },
    async forceFlush() {
      await reader.forceFlush();
    },
    responseTimeMiddleware(req, res, next) {
      const start = Date.now();
      onFinished(res, () => {
        const end = Date.now() - start;
        responseTime.observe(end);
        responseCodes.inc({ status_code: res.statusCode, method: req.method });
      });
      next();
    },
  };

  if (!meter) {
    const resourceConfig = {
      "service.name": applicationName,
      "service.namespace": `${process.env.NODE_ENV === "production" ? "prod" : process.env.NODE_ENV}`,
      "service.instance.id": crypto.randomUUID(),
      ...config,
    };
    const exporter = new MetricExporter();
    reader = new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: 60_000,
    });
    const meterProvider = new MeterProvider({
      readers: [ reader ],
      resource: new Resource(resourceConfig).merge(new GcpDetectorSync().detect()),
      views: [ new View({
        instrumentType: InstrumentType.HISTOGRAM,
        aggregation: new ExponentialHistogramAggregation(),
      }) ],
    });
    meter = meterProvider.getMeter("exp-metrics");

    responseTime = metrics.summary({
      name: "http_response_time_milliseconds",
      help: "Response times in milliseconds",
    });

    responseCodes = metrics.counter({
      name: "http_responses_total",
      help: "Number of HTTP responses",
      labelNames: [ "status_code", "method" ],
    });
  }

  return metrics;
};

function getOtConfig(metricConfig) {
  const name = metricConfig.name;
  const config = prometheusToOpenTelemetry(metricConfig);

  return [
    name,
    config,
  ];
}

function prometheusToOpenTelemetry(config) {
  const replacements = {
    help: "description",
    unit: "unit",
    valueType: "valueType",
    percentiles(key) {
      return { advice: { explicitBucketBoundaries: key } };
    },
  };

  return Object.entries(config)
    .reduce((acc, [ key, value ]) => {
      const replacement = replacements[key];

      switch (typeof replacement) {
        case "string":
          acc[replacement] = value;
          break;
        case "function":
          Object.assign(acc, replacement(value));
          break;
      }

      return acc;
    }, {});
}

function getParams(args) {
  const delta = typeof args[0] === "number" ? args[0] : args[1] ?? 1;
  const attrs = typeof args[0] === "object" ? args[0] : args[1] ?? {};

  return {
    delta,
    attrs,
  };
}
