/**
 * @module index
 */
'use strict';

require('loadenv')('khronos:env');

var CronJob = require('cron').CronJob;
var async = require('async');

var cron;
var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);
var mongodb = require('models/mongodb/mongodb');

var pruneExpiredContextVersions = require('./scripts/prune-expired-context-versions');
var pruneImageBuilderContainers = require('./scripts/prune-image-builder-containers');
var pruneOrphanContainers = require('./scripts/prune-orphan-containers');
var pruneOrphanImages = require('./scripts/prune-orphan-images');

// functions to be run sequentially for both
// manual run and cron run
var seriesFunctions = [
  pruneExpiredContextVersions,
  pruneImageBuilderContainers,
  pruneOrphanContainers,
  // pruneOrphanImages must be run after pruneOrphanContainers
  pruneOrphanImages
];
debug.log('khronos started '+new Date().toString());
process.on('exit', function () {
  debug.log('khronos exit'+new Date().toString());
});
mongodb.connect(function (err) {
  if (err) {
    return debug(err);
  }
  if (process.env.MANUAL_RUN) {
    async.series(seriesFunctions, function () {
      debug.log('complete '+new Date().toString());
      process.exit(0);
    });
  } else {
    cron = new CronJob({
      cronTime: process.env.KHRONOS_INTERVAL,
      onTick: function () {
        var timingKey = 'cron-scripts-duration';
        debug.log('cron run started: '+new Date().toString());
        datadog.startTiming(timingKey);
        async.series(seriesFunctions, function () {
          debug.log('cron run completed: '+new Date().toString());
          datadog.endTiming(timingKey);
        });
      },
      start: true, // run immediately
      timeZone: 'America/Los_Angeles'
    });
  }
});

