"use strict";

const onFinished = require("on-finished");
const promClient = require("prom-client");

const responseTime = new promClient.Summary({
  name: "http_response_time_milliseconds",
  help: "Response times in milliseconds",
  percentiles: [0.5, 0.9, 0.99],
  maxAgeSeconds: 600,
  ageBuckets: 5
});

const responseCodes = new promClient.Counter({
   name: "http_responses_total",
   help: "Number of http responses",
   labelNames: ["status_code", "method"]
});

function responseTimeMiddleware(req, res, next) {
  const start = (new Date()).getTime();
  onFinished(res, () => {
    const end = new Date() - start;
    responseTime.observe(end);
    responseCodes.inc({"status_code": res.statusCode, method: req.method});
  });
  next();
}

function metricsEndpoint(req, res) {
  res.set("Content-Type", promClient.register.contentType);
  res.end(promClient.register.metrics());
}

module.exports = {
  responseTimeMiddleware,
  metricsEndpoint,
  client: promClient
};
