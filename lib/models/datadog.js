/**
 * Common wrapped functions of datadog module
 * @module lib/models/datadog/datadog
 */
'use strict';

var StatsD = require('node-dogstatsd').StatsD;
var client = new StatsD(process.env.DATADOG_HOST, process.env.DATADOG_PORT);

var basePrefix = 'khronos.' + process.env.NODE_ENV;

/**
 * Datadog constructor
 * @param {string} fileName filename prefix for all datadog logged events
 */
function Datadog (fileName) {
  var fileNameRegex = new RegExp(process.env.KHRONOS_FILE_NAME_REGEX);
  var prefix = fileNameRegex.exec(fileName)[0];
  this.prefix = basePrefix + '.' + prefix + '.';
  this.timers = {};
}

/**
 * Creates and stores a Date object for comparision when endTiming is invoked
 * with same key.
 * @param {string} key Key on which to reference the timer.
 */
Datadog.prototype.startTiming = function (key) {
  this.timers[key] = new Date();
};

/**
 * Compares datetime at invokation to previously created Date object from
 * startTiming invokation, derrives difference and reports timing to datadog.
 * @param {string} key Reference key for the timer.
 * @param {array} tags Extra tags to send to datadog.
 */
Datadog.prototype.endTiming = function (key, tags) {
  this.timing(key, new Date() - this.timers[key], tags);
  delete this.timers[key];
};

/**
 * Wrapper of histogram datadog module API method.
 * @param {string} key Reference key for the timer.
 * @param {string|number} val Value to send to datadog.
 * @param {array} tags Extra tags to send to datadog.
 * @returns {null} TODO(bryan) what does client.histogram return?
 */
Datadog.prototype.histogram = function (key, val, tags) {
  return client.histogram(this.prefix + key, val, tags);
};

/**
 * Wrapper of timing datadog module API method.
 * @param {string} key Reference tag for the timer.
 * @param {string|number} val Value to send to datadog.
 * @param {array} tags Extra tags to send to datadog.
 * @return {null} TODO(bryan) what does client.timing return?
 */
Datadog.prototype.timing = function (key, val, tags) {
  if (tags && !Array.isArray(tags)) {
    tags = [tags];
  }
  return client.timing(this.prefix + key, val, tags);
};

module.exports = function (fileName) {
  return new Datadog(fileName);
};
