'use strict'

require('loadenv')()

const Joi = require('joi')
const Promise = require('bluebird')
const TaskFatalError = require('ponos').TaskFatalError

const CanaryBase = require('./CanaryBase')
const CanaryFailedError = require('../../errors/canary-failed-error')
const Docker = require('models/docker')
const Swarm = require('models/swarm')

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
    this.job = job
    this.gauge = 'canary.network-ping'
    this.name = 'Network Canary'
    this.queue = 'khronos:canary:network-ping'
    this.log = this.log.child({
      job: this.job,
      task: this.queue
    })
  }

  test () {
    let contaienrLog = ''
    this.log.debug('Running network ping canary')
    return Promise.try(() => {
      Joi.assert(this.job, Joi.object({
        targetDockerUrl: Joi.string().uri({scheme: ['http']}),
        targetIps: Joi.array().min(1).items(Joi.string().ip()),
        targetOrg: Joi.number()
      }))
    })
    .catch((err) => {
      throw new TaskFatalError(
        'khronos:canary:network-ping',
        'Invalid job',
        { err: err, job: this.job }
      )
    })
    .then(() => {
      const swarm = new Swarm()
      return swarm.checkHostExists(this.job.targetDockerUrl)
    })
    .catch(Swarm.InvalidHostError, (err) => {
      throw new TaskFatalError(
        'khronos:canary:network-ping',
        'Host does not exist',
        { err: err, job: this.job }
      )
    })
    .then(() => {
      this.monitorTags = ['org:' + this.job.targetOrg]
      this.docker = new Docker(this.job.targetDockerUrl)

      return Promise.fromCallback((cb) => {
        this.log.debug('Pulling network ping container')
        this.docker.client.pull(process.env.NETWORK_PING_IMAGE, (err, stream) => {
          if (err) { return cb(err) }
          // followProgress will return with an argument if error
          this.docker.client.modem.followProgress(stream, cb)
        })
      })
    })
    .then(() => {
      this.log.debug('Running network ping container')
      return Promise.fromCallback((cb) => {
        const targetIps = this.job.targetIps.join(' ')
        const cmd = ['bash', '-c', process.env.RUNNABLE_WAIT_FOR_WEAVE + 'node index.js ' + targetIps]
        this.docker.client.run(process.env.NETWORK_PING_IMAGE, cmd, false, (err, data) => {
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
    })
  }
}
