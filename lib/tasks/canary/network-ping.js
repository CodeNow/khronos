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
    this.queue = 'khronos:canary:network-ping'
    this.targetDockerUrl = job.targetDockerUrl
    this.targetIps = job.targetIps
    this.targetOrg = job.targetOrg

    this.docker = new Docker(this.targetDockerUrl)
    this.log = this.log.child({
      dockerHost: this.targetDockerUrl,
      org: this.targetOrg,
      targetIps: this.targetIps,
      task: this.queue
    })
  }

  test () {
    let log = ''
    return Promise.fromCallback((cb) => {
      this.log.debug('Running ping container')
      this.docker.client.run('runnable/heimdall', ['bash', '-c', process.env.RUNNABLE_WAIT_FOR_WEAVE + 'node index.js ' + this.targetIps], false, (err, data) => {
        if (err) {
          log.error({ err: err }, 'failed to run container')
          cb(new CanaryFailedError('Error trying to ping', { err: err }))
        }

        if (data.statusCode === 55) {
          log.error({ data: data, log: log }, 'failed to attach network')
          cb(new CanaryFailedError('failed to attach network', { log: log, data: data }))
        }

        if (data.statusCode !== 0) {
          log.error({ data: data, log: log }, 'ping failed')
          cb(new CanaryFailedError('ping container had non-zero exit', { log: log, data: data }))
        }

        // output of runnable/heimdall will have ERR if any pings failed
        if (~log.indexOf('ERR')) {
          log.warn({ log: log }, 'ping had errors')
          cb(new CanaryFailedError('failed to ping a container', { log: log }))
        }

        log.trace({ log: log }, 'ping complete')
        return cb()
      }).on('stream', (stream) => {
        stream.on('data', (d) => {
          log += log.toString()
        })
      })
    })
  }
}
