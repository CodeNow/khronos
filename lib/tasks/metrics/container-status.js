'use strict'

// external
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var mongodbHelper = require('../utils/mongodb')
var rabbitmqHelper = require('tasks/utils/rabbitmq')

var containerStatusQuery = require('./container-status-query')

module.exports = function (job) {
  return Promise.using(mongodbHelper(), (mongoClient) => {
    var instancesDb = mongoClient.db.collection('instances')
    return Promise.fromCallback((cb) => {
      instancesDb.aggregate(containerStatusQuery, cb)
    })
      .catch((err) => {
        throw new TaskFatalError(
          'khronos:metrics:container-status',
          'Task failed due to database error',
          { err: err }
        )
      })
  })
  .then((orgsStats) => {
    return Promise.using(rabbitmqHelper(['khronos:metrics:report-org-container-status']),
      function (rabbitmq) {
        orgsStats
          .filter((orgStats) => {
            return !!orgStats.orgName;
          })
          .map((orgStats) => {
            var newJob = {
              orgName: orgStats.orgName,
              orgId: orgStats.orgId,
              instances: orgStats.instances,
              totalInstances: orgStats.totalServers
            }
            rabbitmq.publish('khronos:metrics:report-org-container-status', newJob)
          })
      })
  })
}
