Changelog
=========

# 4.0.0

## Breaking
- Requires Node.js >= 24
- Metrics are exported over OTLP to the Google Cloud Telemetry API (`telemetry.googleapis.com`) instead of the deprecated Cloud Monitoring exporter. Metric names change from `workload.googleapis.com/<name>` to `prometheus.googleapis.com/<name>/<counter|gauge|histogram>` on the `prometheus_target` resource, so dashboards and alerts must be updated
- The service account needs `roles/telemetry.writer`, and the Telemetry API must be enabled in the project
- A gauge keeps one value per label set, instead of one value with the last used labels
- The summary option `percentiles` is ignored, it was used as histogram bucket boundaries. Use `buckets` instead

## Added
- `buckets` option for explicit histogram buckets, per summary or for all summaries
- `enabled` option, `false` disables exporting
- `shutdown()` flushes and stops exporting
- `summary.observe(value, labels)` argument order
- TypeScript types

## Changed
- Bump OpenTelemetry JS to 3.x, fixing known vulnerabilities
- Remove the deprecated `GcpDetectorSync` resource detector, `@opentelemetry/resource-detector-gcp` detects the same attributes
- Set the `gcp.project_id` resource attribute from Application Default Credentials, overridable via config
- `proxyquire` is now a dev dependency

## Fixed
- `summary.observe(0)` records 0 instead of 1
- Creating a metric with an existing name returns the existing metric, instead of creating a new one. For gauges this leaked a callback per call

# 2.0.0

## Breaking
- Uses OpenTelemetry instead of Prometheus, which means that middlewares is no longer available
- Initialization now requires execution of the module, i.e. `const metrics = require("exp-metrics")("my-service")`

# 1.0.0

## Breaking
- prom-client@14 has changed major version
