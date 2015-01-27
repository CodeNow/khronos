require('loadenv')();

// will read command line input
// and launch multiple scripts
// eventually
var pruneOrphanContainersImages = require('./scripts/prune-orphan-containers-images');

pruneOrphanContainersImages();

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
