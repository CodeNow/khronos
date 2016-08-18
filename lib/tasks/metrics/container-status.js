'use strict'

// external
var Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal
var mongodbHelper = require('../utils/mongodb')
const rabbitmq = require('models/rabbitmq')

var containerStatusQuery = require('./container-status-query')

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

    var userWhitelistDb = mongoClient.db.collection('userwhitelists')
    var fetchUserWhitelists = Promise.fromCallback((cb) => {
      userWhitelistDb.find({allowed: true}, {lowerName: 1}).toArray(cb)
    })
    return Promise.props({
      orgsStats: fetchContainerStatus,
      userWhitelists: fetchUserWhitelists
    })
  })
  .then((results) => {
    var orgsStats = results.orgsStats
    var userWhitelists = results.userWhitelists
    var whitelistMap = {}
    userWhitelists.forEach((whitelist) => {
      whitelistMap[whitelist.lowerName] = true
    })
    orgsStats
      .filter((orgStats) => {
        return !!orgStats.orgName
      })
      .filter((orgStats) => {
        return whitelistMap[orgStats.orgName.toLowerCase()]
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
