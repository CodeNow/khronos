require('load-env')();

// will read command line input
// and launch multiple scripts
// eventually
var pruneContainers = require('./scripts/prune-containers');

var CronJob = require('cron').CronJob;
var job = new CronJob({
  cronTime: '00 00 12 * * 0-6',
  onTick: function () {
    pruneContainers();
  },
  start: true, // run immediately
  timeZone: 'America/Los_Angeles'
});
