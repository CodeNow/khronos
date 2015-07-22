/**
 * @module index
 */
'use strict';

require('loadenv')('khronos:env');

var CronJob = require('cron').CronJob;
var async = require('async');

var datadog = require('models/datadog/datadog')(__filename);
var log = require('logger').getChild(__filename);
var mongodb = require('models/mongodb/mongodb');
var pruneExitedWeaveContainers = require('./scripts/prune-exited-weave-containers');
var pruneExpiredContextVersions = require('./scripts/prune-expired-context-versions');
var pruneImageBuilderContainers = require('./scripts/prune-image-builder-containers');
var pruneOrphanContainers = require('./scripts/prune-orphan-containers');
var pruneOrphanImages = require('./scripts/prune-orphan-images');

var cron;

// functions to be run sequentially for both
// manual run and cron run
var seriesFunctions = [
  pruneExpiredContextVersions,
  pruneImageBuilderContainers,
  pruneOrphanContainers,
  // pruneOrphanImages must be run after pruneOrphanContainers
  pruneOrphanImages,
  pruneExitedWeaveContainers
];

log.info('khronos process up');

process.on('exit', function () {
  log.info('khronos process exit');
});
mongodb.connect(function (err) {
  if (err) {
    log.error({
      err: err
    }, 'mongodb.connect error');
    return;
  }
  if (process.env.MANUAL_RUN) {
    async.series(seriesFunctions, function () {
      log.trace('complete manual run');
      process.exit(0);
    });
  } else {
    cron = new CronJob({
      cronTime: process.env.KHRONOS_INTERVAL,
      onTick: function () {
        var timingKey = 'cron-scripts-duration';
        log.trace('cron run started');
        datadog.startTiming(timingKey);
        async.series(seriesFunctions, function () {
          log.trace('cron run completed');
          datadog.endTiming(timingKey);
        });
      },
      start: true, // run immediately
      timeZone: 'America/Los_Angeles'
    });
  }
});

