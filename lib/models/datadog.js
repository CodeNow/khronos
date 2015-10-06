/**
 * Common wrapped functions of datadog module
 * @module lib/models/datadog
 */
'use strict';

// external
var last = require('101/last');
var MonitorDog = require('monitor-dog/lib/monitor');
var util = require('util');

var basePrefix = null;

module.exports = Datadog;

/**
 * DataRobot constructor. It's a Datadog client, named Robot.
 * @param {string} prefix Additional prefix to prepend keys sent to DataRobot
 */
function DataRobot (prefix) {
  if (last(prefix) !== '.') {
    prefix += '.';
  }
  MonitorDog.call(this, {
    prefix: 'khronos.' + prefix,
    host: process.env.DATADOG_HOST,
    port: process.env.DATADOG_PORT
  });
}
util.inherits(Datadog, MonitorDog);
