'use strict';

var StatsD = require('node-dogstatsd').StatsD;
var client = new StatsD(process.env.DATADOG_HOST,
  process.env.DATADOG_PORT);
var basePrefix = 'khronos';

function Datadog (fileName) {
  var prefix = /\/?([A-z0-9]+)?\/([A-z0-9]+)\.js$/.exec(fileName)[0];
  this.prefix = basePrefix + '|' + prefix + '|';
  this.timers = {};
}

Datadog.prototype.startTiming = function (key) {
  this.timers[key] = new Date();
};

Datadog.prototype.endTiming = function (key, tags) {
  this.timing(key, new Date() - this.timers[key], tags);
  delete this.timers[key];
};

Datadog.prototype.histogram = function (key, val, tags) {
  return client.histogram(this.prefix+key, val, tags);
};

Datadog.prototype.timing = function (key, val, tags) {
  if (tags && !Array.isArray(tags)) {
    tags = [tags];
  }
  return client.timing(this.prefix+key, val, tags);
};

module.exports = Datadog;
