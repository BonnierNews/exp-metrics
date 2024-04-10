"use strict";

const fs = require("fs");
const LOG_FILE = "./log";

function log(...args) {
  fs.appendFileSync(LOG_FILE, args.map((arg) => {
    if (typeof arg === "object") {
      if (arg instanceof Error) {
        return `${arg.message} \n${arg.stack}`;
      }
      return JSON.stringify(arg, null, 2);
    }
    return arg;
  })
    .concat("\n")
    .join(" "));
}

module.exports = {
  verbose: log.bind(null, "VERBOSE"),
  debug: log.bind(null, "DEBUG"),
  info: log.bind(null, "INFO"),
  warn: log.bind(null, "WARN"),
  error: log.bind(null, "ERROR"),
};
