/**
 * Gets all the docks and enqueues a job for each.
 * @module lib/tasks/images/prune
 */
'use strict'

// external
const Promise = require('bluebird')
const TaskFatalError = require('ponos').TaskFatalError

// internal
const log = require('logger').getChild(__filename)
const rabbitmqHelper = require('tasks/utils/rabbitmq')
const Swarm = require('models/swarm')

/**
 * Finds a random running CodeNow dock and marks it unhealthy.
 * @return {promise} Resolved when kill job has been enqueued.
 */
module.exports = function () {
  var DOCK_UNHEALTHY_QUEUE_NAME = 'on-dock-unhealthy'
  var CODENOW_GITHUB_ID = '2335750'
  const swarm = new Swarm()
  return swarm.getHostsWithOrgs()
    .then(function (docks) {
      var possibleDocks = docks.filter(function (dock) {
        return dock.org === CODENOW_GITHUB_ID
      })
      if (possibleDocks.length === 0) {
        throw new TaskFatalError('No CodeNow Docks exist.')
      }
      return possibleDocks[ Math.floor(Math.random() * possibleDocks.length) ]
    })
    .then(function (dockToKill) {
      return Promise.using(
        rabbitmqHelper([DOCK_UNHEALTHY_QUEUE_NAME]),
        function (rabbitmq) {
          var data = { host: dockToKill.host, githubId: CODENOW_GITHUB_ID }
          log.trace(data, 'obliterate-codenow: killing random dock')
          rabbitmq.publish(DOCK_UNHEALTHY_QUEUE_NAME, data)
        })
    })
    .catch(function (err) {
      log.error({ err: err }, 'Error in docks/obliterate-codenow')
      throw err
    })
}
