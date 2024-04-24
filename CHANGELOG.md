Changelog
=========

# 2.0.0

## Breaking
- Uses OpenTelemetry instead of Prometheus, which means that middlewares is no longer available
- Initialization now requires execution of the module, i.e. `const metrics = require("exp-metrics")("my-service")`

# 1.0.0

## Breaking
- prom-client@14 has changed major version
