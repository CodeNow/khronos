require('loadenv');
var CronJob = require('cron').CronJob;
var async = require('async');

var pruneOrphanImages = require('./scripts/prune-orphan-images');
var pruneExpiredContextVersions = require('./scripts/prune-expired-context-versions');

new CronJob({
  cronTime: '00 00 12 * * 0-6', // every day at 12:00
  onTick: function () {
    async.series([
      pruneExpiredContextVersions,
      pruneOrphanImages
    ]);
  },
  start: true, // run immediately
  timeZone: 'America/Los_Angeles'
});
