require('loadenv');

// will read command line input
// and launch multiple scripts
// eventuallycontainers
var pruneOrphanImages = require('./scripts/prune-orphan-images');

pruneOrphanImages();

/*
var CronJob = require('cron').CronJob;
var job = new CronJob({
  cronTime: '00 00 12 * * 0-6', // every day at 12:00
  onTick: function () {
    pruneOrphanImages();
  },
  start: true, // run immediately
  timeZone: 'America/Los_Angeles'
});
*/
