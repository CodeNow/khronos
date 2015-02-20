'use strict';

require('loadenv');
var CronJob = require('cron').CronJob;
var async = require('async');

var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);

var pruneOrphanImagesAndContainers = require('./scripts/prune-orphan-images-and-containers');
var pruneExpiredContextVersions = require('./scripts/prune-expired-context-versions');

debug.log('khronos started '+new Date().toString());

process.on('exit', function () {
  debug.log('khronos exit'+new Date().toString());
});

// functions to be run sequentially for both
// manual run and cron run
var seriesFunctions = [
  pruneExpiredContextVersions,
  pruneOrphanImagesAndContainers
];

var cron;
var mongodb = require('models/mongodb/mongodb');
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

