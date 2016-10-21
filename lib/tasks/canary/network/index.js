'use strict'

const isEmpty = require('101/is-empty')
const Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const logger = require('logger')
const mongodbHelper = require('tasks/utils/mongodb')
const rabbitmq = require('models/rabbitmq')
const OrganizationService = require('services/organization.service')

const containerNetworkQuery = [{
  $match: { // match only containers that are running
    'container.inspect.State.Running': true
  }
}, {
  $group: {
    _id: '$owner.github', // group by org
    dockerUrl: { // get a dockerHost from first instance
      $first: '$container.dockerHost'
    },
    ips: { // accumulate weave container ip addresses
      $push: '$network.hostIp'
    },
    hosts: { // accumulate container hosts
      $push: '$container.dockerHost'
    },
    containers: { // accumulate container ids
      $push: '$container.dockerContainer'
    },
    cvs: { // accumulate cv ids
      $push: '$contextVersion._id'
    }
  }
}]

/**
 * Creates one network ping job per org.
 * Send one dockerHost and all running containers weave ips for that org
 * @return {Promise}
 * @resolves {undefined} When jobs created successfully
 * @rejects {WorkerStopError} if failed to query db
 */
module.exports = () => {
  const log = logger.child({
    queue: 'canary.network.run'
  })
  return Promise.using(mongodbHelper(), (mongoClient) => {
    return mongoClient.instancesAggregate(containerNetworkQuery)
      .catch((err) => {
        throw new WorkerStopError(
          'Task failed due to database error',
          { err: err }
        )
      })
  })
  .each((network) => {
    log.trace({ network }, 'create ping job')
    return Promise.try(() => {
      // do nothing if there are no ips to ping
      if (isEmpty(network.ips)) {
        log.trace({ network }, 'no ips to ping, skipping')
        return
      }
      return OrganizationService.isActiveOrg(network._id)
        .then(function (isActive) {
          if (isActive) {
            rabbitmq.publishTask('canary.network-ping.run', {
              targetDockerUrl: network.dockerUrl,
              targetIps: network.ips,
              targetOrg: network._id,
              targetCvs: network.cvs,
              targetHosts: network.hosts,
              targetContainers: network.containers
            })
          }
        })
    })
  })
}
