require('loadenv')();

// will read command line input
// and launch multiple scripts
// eventuallycontainers
var pruneOrphanImages = require('./scripts/prune-orphan-images');

pruneOrphanImages();

/*
 * TEMP
var CronJob = require('cron').CronJob;
var job = new CronJob({
  cronTime: '00 00 12 * * 0-6',
  onTick: function () {
    pruneOrphanContainersImages();
  },
  start: true, // run immediately
  timeZone: 'America/Los_Angeles'
});
*/