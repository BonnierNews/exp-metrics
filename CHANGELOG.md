Changelog
=========

# Unreleased

## Breaking
- Requires Node.js >= 24
- Metrics are exported over OTLP to the Google Cloud Telemetry API (`telemetry.googleapis.com`) instead of the deprecated Cloud Monitoring exporter. Metric names change from `workload.googleapis.com/<name>` to `prometheus.googleapis.com/<name>/<counter|gauge|histogram>` on the `prometheus_target` resource, so dashboards and alerts must be updated
- The service account needs `roles/telemetry.writer`, and the Telemetry API must be enabled in the project

## Changed
- Bump OpenTelemetry JS to 2.x, fixing known vulnerabilities
- Remove the deprecated `GcpDetectorSync` resource detector, `@opentelemetry/resource-detector-gcp` detects the same attributes
- Set the `gcp.project_id` resource attribute from Application Default Credentials, overridable via config
- `proxyquire` is now a dev dependency

## Fixed
- `summary.observe(0)` records 0 instead of 1

# 2.0.0

## Breaking
- Uses OpenTelemetry instead of Prometheus, which means that middlewares is no longer available
- Initialization now requires execution of the module, i.e. `const metrics = require("exp-metrics")("my-service")`

# 1.0.0

## Breaking
- prom-client@14 has changed major version
