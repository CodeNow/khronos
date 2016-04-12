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
    let contaienrLog = ''
    return Promise.fromCallback((cb) => {
      this.log.debug('Running ping container')
      this.docker.client.run('runnable/heimdall', ['bash', '-c', process.env.RUNNABLE_WAIT_FOR_WEAVE + 'node index.js ' + this.targetIps], false, (err, data) => {
        if (err) {
          this.log.error({ err: err }, 'failed to run container')
          return cb(new CanaryFailedError('Error trying to ping', { err: err }))
        }

        if (data.StatusCode === 55) {
          this.log.error({ data: data, log: contaienrLog }, 'failed to attach network')
          return cb(new CanaryFailedError('failed to attach network', { log: contaienrLog, data: data }))
        }

        if (data.StatusCode !== 0) {
          this.log.error({ data: data, log: contaienrLog }, 'ping failed')
          return cb(new CanaryFailedError('ping container had non-zero exit', { log: contaienrLog, data: data }))
        }

        // output of runnable/heimdall will have ERR if any pings failed
        if (~contaienrLog.indexOf('ERR')) {
          this.log.warn({ log: contaienrLog }, 'ping had errors')
          return cb(new CanaryFailedError('failed to ping a container', { log: contaienrLog }))
        }

        this.log.trace({ log: contaienrLog }, 'ping complete')
        return cb()
      }).on('stream', (stream) => {
        stream.on('data', (l) => {
          contaienrLog += l.toString()
        })
      })
    })
  }
}
