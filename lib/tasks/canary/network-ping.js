'use strict'

require('loadenv')()

const CanaryBase = require('./CanaryBase')
const CanaryFailedError = require('../../errors/canary-failed-error')
const Docker = require('models/docker')
const Promise = require('bluebird')

/**
 * Runs a container in an orgs network which pings all their running containers
 * @param {object} job The canary job to execute.
 * @return {Promise}
 * @resolves {undefined} When Canary passes
 * @rejects {CanaryFailedError} if ping hit an issue
 */
module.exports = (job) => {
  return new NetworkOrgCanary(job).executeTest()
}

class NetworkOrgCanary extends CanaryBase {
  constructor (job) {
    super(job)
    this.gauge = 'canary.network-ping'
    this.monitorTags = 'org=' + this.targetOrg
    this.name = 'Network Canary'
    this.queue = 'khronos:canary:network-org-ping'
    this.targetDockerUrl = job.targetDockerUrl
    this.targetIps = job.targetIps
    this.targetOrg = job.targetOrg

    this.docker.client = new Docker(this.targetDockerUrl)
    this.log = this.log.child({
      dockerHost: this.targetDockerUrl,
      org: this.targetOrg,
      targetIps: this.targetIps,
      task: this.queue
    })
  }

  test () {
    let log = ''
    return Promise.asCallback((cb) => {
      this.log.debug('Running ping container')
      this.docker.client.run('runnable/heimdall', ['bash', '-c', process.env.RUNNABLE_WAIT_FOR_WEAVE + 'node index.js ' + this.targetIps], false, (err, data) => {
        let outError
        if (err) {
          outError = new CanaryFailedError('Error trying to ping', { err: err })
        }

        if (data.statusCode !== 0) {
          outError = new CanaryFailedError('ping container had non-zero exit', { log: log })
        }
          // output of runnable/heimdall will have ERR if any pings failed
        if (~log.indexOf('ERR')) {
          outError = new CanaryFailedError('failed to ping a container', { log: log })
        }

        return cb(outError)
      }).on('stream', (stream) => {
        stream.on('data', (d) => {
          log += log.toString()
        })
      })
    })
  }
}
