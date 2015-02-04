'use strict';

var StatsD = require('node-dogstatsd').StatsD;
var client = new StatsD(process.env.DATADOG_HOST,
                            process.env.DATADOG_PORT);
var prefix = 'khronos';

function Stats (moduleName) {
  this.prefix = prefix + '.' + moduleName + '.';
}

Stats.prototype.histogram = function (key, val) {
  return client.histogram(this.prefix+key, val);
};

Stats.prototype.timing = function (key, val) {
  return client.timing(this.prefix+key, val);
};

module.exports = Stats;
