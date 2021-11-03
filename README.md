# exp-metrics

[![Run tests](https://github.com/BonnierNews/exp-metrics/actions/workflows/run-tests.yml/badge.svg?branch=master)](https://github.com/BonnierNews/exp-metrics/actions/workflows/run-tests.yml)

Simple bootstrapping of basic prometheus metrics for your express based application.

The library exposes three things:

1. `responseTimeMiddleware` - an express compliant middleware to record the response times on 0.5, 0.9 and 0.99 percentiles. Also records the status codes for each response.
2. `metricsEndpoint` - An endpoint you can add to `/metrics` in your express router and allow prometheus to scrape.
3. `client` - the underlying prometheus client if you want to add custom metrics to your application.

## installing

```
npm install @bonniernews/exp-metrics
```

## Example

```js
const express = require("express");
const expMetrics = require("@bonniernews/exp-metrics");

const app = express();

//Set up the middleware
app.use(expMetrics.responseTimeMiddleware);

//Expose the endpoint for the metrics to be scraped
app.get("/metrics", expMetrics.metricsEndpoint);

app.get("/", (req, res) => {
  res.send("Hello world");
});

app.listen(3000, () => console.log("Running on port 3000"));
```
