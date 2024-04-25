"use strict";

const { MetricExporter } = require("@google-cloud/opentelemetry-cloud-monitoring-exporter");
const { MeterProvider, PeriodicExportingMetricReader } = require("@opentelemetry/sdk-metrics");
const { Resource } = require("@opentelemetry/resources");
const { GcpDetectorSync } = require("@google-cloud/opentelemetry-resource-util");
const gcpMetadata = require("gcp-metadata");

let instanceId;

(() => {
  gcpMetadata.isAvailable().then(async (gcpMetadataAvailable) => {
    instanceId = gcpMetadataAvailable ? await gcpMetadata.instance("id") : crypto.randomUUID();
  });
})();

module.exports = function expMetrics(applicationName = "exp-metrics", config = {}) {
  console.log(`XXX: ${instanceId}`); // eslint-disable-line no-console
  const resourceConfig = {
    "service.name": applicationName,
    "service.namespace": `${process.env.NODE_ENV === "production" ? "prod" : process.env.NODE_ENV}`,
    "service.instance.id": instanceId,
    ...config,
  };
  const exporter = new MetricExporter();
  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: 60_000,
  });
  const meterProvider = new MeterProvider({
    readers: [ reader ],
    resource: new Resource(resourceConfig).merge(new GcpDetectorSync().detect()),
  });
  const meter = meterProvider.getMeter("exp-metrics");

  return {
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
  };
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
