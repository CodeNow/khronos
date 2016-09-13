'use strict'

// external
var Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal
var mongodbHelper = require('../utils/mongodb')
const rabbitmq = require('models/rabbitmq')

var containerStatusQuery = require('./container-status-query')

module.exports = function () {
  return Promise.using(mongodbHelper(), (mongoClient) => {
    var instancesDb = mongoClient.db.collection('instances')
    return Promise.fromCallback((cb) => {
      instancesDb.aggregate(containerStatusQuery, cb)
    })
      .catch((err) => {
        throw new WorkerStopError(
          'Task failed due to database error',
          { err: err }
        )
      })
  })
  .then((orgsStats) => {
    orgsStats
      .filter((orgStats) => {
        return !!orgStats.orgName
      })
      .map((orgStats) => {
        var newJob = {
          orgName: orgStats.orgName,
          orgId: orgStats.orgId,
          instances: orgStats.instances,
          totalInstances: orgStats.totalServers
        }
        rabbitmq.publishTask('khronos:metrics:report-org-container-status', newJob)
      })
  })
}
