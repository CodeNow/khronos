/**
 * Check container against mongo and if it doesn't exist, enqueue a job to
 * delete it.
 * @module lib/tasks/container/check-against-mongo
 */
'use strict'

// external
var assign = require('101/assign')
var exists = require('101/exists')
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var mongodbHelper = require('tasks/utils/mongodb')
var rabbitmqHelper = require('tasks/utils/rabbitmq')
var log = require('logger').getChild(__filename)

var containerStatusQuery = require('./container-status-query')

module.exports = function (job) {
  return Promise.resolve()
    .then(function queryMongoForStats () {
      return Promise.using(mongodbHelper(),
        function (mongoClient) {
          var instancesDb = mongoClient.db.collection('instances')
          return Promise.fromCallback(function (cb) {
            instancesDb.aggregate(containerStatusQuery, cb)
          })
        })
    })
    .then(function (instances) {

    })

    .catch(function (err) {
      log.error({ err: err }, 'delete container task error')
      throw err
    })
}
