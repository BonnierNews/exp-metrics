"use strict";

const request = require("supertest");
const express = require("express");
const expMetrics = require("..");

Feature("Metrics", () => {

  let app;
  Given("An express app", () => {
    app = express();
  });

  And("it is using our response time middleware", () => {
    app.use(expMetrics.responseTimeMiddleware);
  });

  And("it have an route", () => {
    app.get("/", (req, res) => {
      res.send("Hello world");
    });
  });

  And("it is exposes our metrics endpoint", () => {
    app.get("/metrics", expMetrics.metricsEndpoint);
  });

  When("a request is made to the express app", (done) => {
    request(app)
      .get("/")
      .expect(200)
      .end(done);
  });

  let response;
  Then("the metrics endpoint should expose some metrics", (done) => {
    request(app)
      .get("/metrics")
      .expect(200)
      .expect("content-type", "text/plain; version=0.0.4; charset=utf-8")
      .end((err, res) => {
        if (err) return done(err);
        response = res.text;
        done();
      });
  });

  let rows;
  And("it should have recorded our metrics", () => {
    rows = response.split("\n");
    expect(rows).to.have.length(12);
  });

  And("the two first rows should be infomation texts", () => {
    expect(rows[0]).to.equal("# HELP http_response_time_milliseconds Response times in milliseconds");
    expect(rows[1]).to.equal("# TYPE http_response_time_milliseconds summary");
  });

  And("we should have recorded the response time in 50th, 90th and 99th percentiles", () => {
    expect(rows[2]).to.match(/http_response_time_milliseconds{quantile="0\.5"} \d+/);
    expect(rows[3]).to.match(/http_response_time_milliseconds{quantile="0\.9"} \d+/);
    expect(rows[4]).to.match(/http_response_time_milliseconds{quantile="0\.99"} \d+/);
  });

  And("it should have the sum of all response times", () => {
    expect(rows[5]).to.match(/http_response_time_milliseconds_sum \d+/);
  });

  And("it should have counted all the response times", () => {
    expect(rows[6]).to.equal("http_response_time_milliseconds_count 1");
  });

  And("a whitespace", () => {
    expect(rows[7]).to.equal("");
  });

  And("line nine and ten should be information texts", () => {
    expect(rows[8]).to.equal("# HELP http_responses_total Number of http responses");
    expect(rows[9]).to.equal("# TYPE http_responses_total counter");
  });

  And("we should have recorded that one 200 response has been sent", () => {
    expect(rows[10]).to.equal("http_responses_total{status_code=\"200\",method=\"GET\"} 1");
  });

  And("we should end with a whitespace", () => {
    expect(rows[11]).to.equal("");
  });
});
