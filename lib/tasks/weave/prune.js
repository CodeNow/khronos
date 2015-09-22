'use strict';

var log = require('../../logger').getChild(__filename);
var Mavis = require('../../models/mavis');
var Promise = require('bluebird');
var rabbitmqHelper = require('../utils/rabbitmq');

/**
 * Task that enqueues a prune-dock job for every dock in Mavis.
 * @return {promise} Resolved when all jobs have been enqueued.
 */
module.exports = function (/* job */) {
  return Promise.using(rabbitmqHelper(['khronos:weave:prune-dock']),
    function (rabbitmq) {
      return Promise.resolve()
        .then(function connectToRabbit () {
          return rabbitmq.connectAsync();
        })
        .then(function getDocksFromMavis () {
          var mavis = new Mavis();
          return mavis.getDocks();
        })
        // each is guarenteed to be serial
        .each(function createNewJobsForEachDock (host) {
          var data = { dockerHost: host };
          rabbitmq.publish('khronos:weave:prune-dock', data);
          return host;
        })
        .then(function returnNumberOfHosts (hosts) {
          return hosts.length;
        });
    })
    .catch(function (err) {
      log.error({ err: err }, '.task error');
      throw err;
    });
};
