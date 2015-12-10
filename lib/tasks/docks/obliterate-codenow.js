/**
 * Gets all the docks and enqueues a job for each.
 * @module lib/tasks/images/prune
 */
'use strict'

// internal
var log = require('logger').getChild(__filename)
var rabbitmqHelper = require('tasks/utils/rabbitmq')
var Mavis = require('models/mavis')

/**
 * Finds a random running CodeNow dock and marks it unhealthy.
 * @return {promise} Resolved when kill job has been enqueued.
 */
module.exports = function () {
  var DOCK_UNHEALTHY_QUEUE_NAME = 'on-dock-unhealthy'
  var CODENOW_GITHUB_ID = '2335750'
  var mavis = new Mavis()
  return mavis.getRawDocks()
    .then(function (docks) {
      var possibleDocks = docks.filter(function (dock) {
        return dock.tags.indexOf(CODENOW_GITHUB_ID) !== -1
      })
      return possibleDocks[ Math.round(Math.random() * possibleDocks.length) + 1 ]
    })
    .then(function (dockToKill) {
      return Promise.using(
        rabbitmqHelper([DOCK_UNHEALTHY_QUEUE_NAME]),
        function (rabbitmq) {
          return Promise.resolve()
            .then(function () {
              var data = { dockerHost: dockToKill.host, githubId: CODENOW_GITHUB_ID }
              rabbitmq.publish(DOCK_UNHEALTHY_QUEUE_NAME, data)
            })
        })
    })
    .catch(function (err) {
      log.error({ err: err }, 'Error in docks/obliterate-codenow')
      throw err
    })
}
