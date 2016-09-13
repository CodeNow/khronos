'use strict'

// external
const Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')
const BigPoppaClient = require('@runnable/big-poppa-client')

// internal
const mongodbHelper = require('../utils/mongodb')
const rabbitmq = require('models/rabbitmq')

const containerStatusQuery = require('./container-status-query')

module.exports = function (job) {
  return Promise.using(mongodbHelper(), (mongoClient) => {
    var instancesDb = mongoClient.db.collection('instances')
    var fetchContainerStatus = Promise.fromCallback((cb) => {
      instancesDb.aggregate(containerStatusQuery, cb)
    })
      .catch((err) => {
        throw new WorkerStopError(
          'Task failed due to database error',
          { err: err }
        )
      })
    var bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)
    var fetchAllowedOrganizations = bigPoppaClient.getOrganizations().filter((x) => x.allowed)
    return Promise.props({
      orgsStats: fetchContainerStatus,
      allowedOrganizations: fetchAllowedOrganizations
    })
  })
  .then((results) => {
    var orgsStats = results.orgsStats
    var organizations = results.allowedOrganizations
    var organizationsMap = {}
    organizations.forEach((org) => {
      organizationsMap[org.lowerName] = true
    })
    return Promise.using(rabbitmqHelper(['khronos:metrics:report-org-container-status']),
      function (rabbitmq) {
        orgsStats
          .filter((orgStats) => {
            return !!orgStats.orgName
          })
          .filter((orgStats) => {
            return organizationsMap[orgStats.orgName.toLowerCase()]
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
