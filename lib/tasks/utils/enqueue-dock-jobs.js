'use strict'

// external
var isString = require('101/is-string')
var Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal
const rabbitmq = require('models/rabbitmq')
var Swarm = require('models/swarm')

/**
 * Enqueue Dock Jobs Helper. This helper generates a promise that, given a
 * targetQueue string value, gets all the avilable docks from Swarm and enquques
 * a job `{ dockerHost: host }` to the targetQueue for each host. This helper
 * does not provide any error catching; that is left up to the implemented task.
 * @param {string} targetQueue Queue to which to place jobs.
 * @return {promise} Resolves when jobs have been queued.
 */
module.exports = function (targetQueue) {
  return Promise.resolve()
    .then(function validateArguments () {
      if (!isString(targetQueue)) {
        throw new WorkerStopError(
          'Enqueue Dock Jobs util requires a string target')
      }
    })
    .then(function runHelper () {
      return Promise.resolve()
        .then(function getDocksFromSwarm () {
          const swarm = new Swarm()
          return swarm.getSwarmHosts()
        })
        // NOTE: rabbitmq is connected in the helper
        // NOTE: .each is guaranteed to be serial
        .each(function createNewJobsForEachDock (host) {
          var data = { dockerHost: host }
          rabbitmq.publishTask(targetQueue, data)
          return host
        })
        .then(function returnNumberOfHosts (hosts) {
          return hosts.length
        })
    // NOTE: does not catch - that is left to the task
    })
}
