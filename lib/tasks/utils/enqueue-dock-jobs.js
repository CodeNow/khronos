'use strict';

var isString = require('101/is-string');
var Mavis = require('../../models/mavis');
var Promise = require('bluebird');
var rabbitmqHelper = require('../utils/rabbitmq');
var TaskFatalError = require('ponos').TaskFatalError;

/**
 * Enqueue Dock Jobs Helper. This helper generates a promise that, given a
 * targetQueue string value, gets all the avilable docks from Mavis and enquques
 * a job `{ dockerHost: host }` to the targetQueue for each host. This helper
 * does not provide any error catching; that is left up to the implemented task.
 * @param {string} targetQueue Queue to which to place jobs.
 * @return {promise} Resolves when jobs have been queued.
 */
module.exports = function (targetQueue) {
  if (!isString(targetQueue)) {
    throw new TaskFatalError('Enqueue Dock Jobs util requires a string target');
  }
  return Promise.using(
    rabbitmqHelper([targetQueue]),
    function (rabbitmq) {
      return Promise.resolve()
        // NOTE: rabbitmq is connected in the helper
        .then(function getDocksFromMavis () {
          var mavis = new Mavis();
          return mavis.getDocks();
        })
        // NOTE: .each is guarenteed to be serial
        .each(function createNewJobsForEachDock (host) {
          var data = { dockerHost: host };
          rabbitmq.publish(targetQueue, data);
          return host;
        })
        .then(function returnNumberOfHosts (hosts) {
          return hosts.length;
        });
    });
    // NOTE: does not catch - that is left to the task
};
