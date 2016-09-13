'use strict'

// external
const Promise = require('bluebird')
const rabbitmq = require('models/rabbitmq')
const mongodbHelper = require('tasks/utils/mongodb')
const moment = require('moment')

// internal
const logger = require('logger').getChild(__filename)

module.exports = CleanupInstances

function CleanupInstances () {
  const cleanupDate = moment().subtract(7, 'days').toDate()
  var log = logger.child({
    cleanupCutoff: cleanupDate
  })
  log.info('CleanupInstances')

  return Promise.using(mongodbHelper(), function (mongoClient) {
    return mongoClient.fetchInstancesAsync({
      masterPod: false,
      'contextVersion.created': { $lt: cleanupDate },
      'allowAutoDeletion': { $ne: true },
      $or: [
        { isolated: { $exists: false } },
        { isIsolationGroupMaster: true }
      ]
    })
  })
    .then(function (instances) {
      log.info({
        instanceCount: instances.length,
        instanceIds: instances.map(function (instance) {
          return instance._id
        })
      }, 'Found instances to cleanup')
      instances.forEach(function (instance) {
        rabbitmq.publishEvent('instance.expired', {
          instanceId: instance._id
        })
      })
    })
}
