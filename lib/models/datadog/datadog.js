/**
 * wrap datadog js sdk method invokations consistently
 * @module lib/models/datadog/datadog
 */
'use strict';

var StatsD = require('node-dogstatsd').StatsD;

module.exports = function (fileName) {
  return new Datadog(fileName);
};

var client = new StatsD(process.env.DATADOG_HOST,
  process.env.DATADOG_PORT);
var basePrefix = 'khronos|'+process.env.NODE_ENV;

/**
 * @class
 * @param {String} fileName - filename, prepended to datadog keys
 */
function Datadog (fileName) {
  var fileNameRegex = new RegExp(process.env.KHRONOS_FILE_NAME_REGEX);
  var prefix = fileNameRegex.exec(fileName)[0];
  this.prefix = basePrefix + '|' + prefix + '|';
  this.timers = {};
}

/**
 * Create a timer to compare elapsed time against later w/ endTiming
 * @param {String} key
 */
Datadog.prototype.startTiming = function (key) {
  this.timers[key] = new Date();
};

/**
 * Compare elapsed time against timer created in startTiming()
 * @param {String} key
 * @param {Array} tags
 */
Datadog.prototype.endTiming = function (key, tags) {
  this.timing(key, new Date() - this.timers[key], tags);
  delete this.timers[key];
};

/**
 * Invoke datadog.histogram w/ consistent key prefix
 * @param {String} key
 * @param {?} val
 * @param {Array} tags
 */
Datadog.prototype.histogram = function (key, val, tags) {
  return client.histogram(this.prefix+key, val, tags);
};

/**
 * Invoke timing w/ consistent prefix
 * @param {String} key
 * @param {?} val
 * @param {Array} tags
 */
Datadog.prototype.timing = function (key, val, tags) {
  if (tags && !Array.isArray(tags)) {
    tags = [tags];
  }
  return client.timing(this.prefix+key, val, tags);
};
