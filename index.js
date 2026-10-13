"use strict";

const { OTLPMetricExporter } = require("@opentelemetry/exporter-metrics-otlp-proto");
const { GoogleAuth } = require("google-auth-library");
const { MeterProvider, PeriodicExportingMetricReader, InstrumentType, AggregationType } = require("@opentelemetry/sdk-metrics");
const { resourceFromAttributes, detectResources } = require("@opentelemetry/resources");
const { containerDetector } = require("@opentelemetry/resource-detector-container");
const { gcpDetector } = require("@opentelemetry/resource-detector-gcp");
const crypto = require("crypto");
const onFinished = require("on-finished");

let meterProvider;
let meter;
let bucketMeter;
let defaultBuckets;
let responseCodes;
let responseTime;
const instruments = new Map();

module.exports = function expMetrics(applicationName = "exp-metrics", config = {}) {
  const metrics = {
    counter(metricConfig) {
      return getInstrument(metricConfig.name, () => {
        const metric = meter.createCounter(...getOtConfig(metricConfig));
        return {
          metric,
          inc(...args) {
            const { delta, attrs } = getParams(args);
            return metric.add(delta, attrs);
          },
        };
      });
    },
    gauge(metricConfig) {
      return getInstrument(metricConfig.name, () => {
        const values = new Map();
        const metric = meter.createObservableGauge(...getOtConfig(metricConfig));
        metric.addCallback((result) => {
          for (const { value, attrs } of values.values()) {
            result.observe(value, attrs);
          }
        });

        function update(args, fn) {
          const { delta, attrs } = getParams(args);
          const key = getAttributesKey(attrs);
          const value = fn(values.get(key)?.value ?? 0, delta);
          values.set(key, { value, attrs });
        }

        return {
          metric,
          set(...args) {
            update(args, (_value, delta) => delta);
          },
          inc(...args) {
            update(args, (value, delta) => value + delta);
          },
          dec(...args) {
            update(args, (value, delta) => value - delta);
          },
        };
      });
    },
    summary(metricConfig) {
      return getInstrument(metricConfig.name, () => {
        const buckets = metricConfig.buckets ?? defaultBuckets;
        const histogramMeter = buckets ? bucketMeter : meter;
        const metric = histogramMeter.createHistogram(...getOtConfig({ ...metricConfig, ...(buckets && { buckets }) }));
        return {
          metric,
          observe(...args) {
            const { delta, attrs } = getParams(args);
            return metric.record(delta, attrs);
          },
        };
      });
    },
    async forceFlush() {
      await meterProvider.forceFlush();
    },
    async shutdown() {
      await meterProvider.shutdown();
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
    const { enabled = true, buckets, ...attributes } = config;
    meterProvider = enabled ? createMeterProvider(applicationName, attributes, buckets) : new MeterProvider();
    meter = meterProvider.getMeter("exp-metrics");
    bucketMeter = meterProvider.getMeter("exp-metrics-buckets");
    defaultBuckets = Array.isArray(buckets) ? buckets : undefined;

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

function createMeterProvider(applicationName, attributes, buckets) {
  const auth = new GoogleAuth({ scopes: "https://www.googleapis.com/auth/cloud-platform" });
  const resourceConfig = {
    "gcp.project_id": attributes["gcp.project_id"] ?? auth.getProjectId(),
    "service.name": applicationName,
    "service.namespace": `${process.env.NODE_ENV === "production" ? "prod" : process.env.NODE_ENV}`,
    "service.instance.id": crypto.randomUUID(),
    ...attributes,
  };
  const exporter = new OTLPMetricExporter({
    url: "https://telemetry.googleapis.com/v1/metrics",
    async headers() {
      return Object.fromEntries(await auth.getRequestHeaders());
    },
  });
  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: 60_000,
    maxExportBatchSize: 200,
  });

  return new MeterProvider({
    readers: [ reader ],
    resource: resourceFromAttributes(resourceConfig).merge(
      detectResources({ detectors: [ containerDetector, gcpDetector ] })
    ),
    views: buckets ? [] : [ {
      instrumentType: InstrumentType.HISTOGRAM,
      meterName: "exp-metrics",
      aggregation: { type: AggregationType.EXPONENTIAL_HISTOGRAM },
    } ],
  });
}

function getInstrument(name, create) {
  if (!instruments.has(name)) {
    instruments.set(name, create());
  }
  return instruments.get(name);
}

function getAttributesKey(attrs) {
  return JSON.stringify(Object.keys(attrs).sort().map((key) => [ key, attrs[key] ]));
}

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
    buckets(key) {
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
