require('loadenv');
var CronJob = require('cron').CronJob;
var async = require('async');

var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);

var pruneOrphanImages = require('./scripts/prune-orphan-images');
var pruneExpiredContextVersions = require('./scripts/prune-expired-context-versions');

new CronJob({
  cronTime: '00 00 12 * * 0-6', // every day at 12:00
  onTick: function () {
    var timingKey = 'cron-scripts-duration';
    debug.log('cron started: ' + new Date().toString());
    datadog.startTiming(timingKey);
    async.series([
      pruneExpiredContextVersions,
      pruneOrphanImages
    ], function () {
      debug.log('cron completed: ' + new Date().toString());
      datadog.endTiming(timingKey);
    });
  },
  start: true, // run immediately
  timeZone: 'America/Los_Angeles'
});
