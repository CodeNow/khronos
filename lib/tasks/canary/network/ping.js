'use strict'

require('loadenv')()

const Joi = require('joi')
const Promise = require('bluebird')
const TaskFatalError = require('ponos').TaskFatalError

const CanaryBase = require('tasks/canary/canary-base')
const CanaryFailedError = require('errors/canary-failed-error')
const Docker = require('models/docker')
const rabbitmqHelper = require('tasks/utils/rabbitmq')
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
    const PING_IMAGE = process.env.NETWORK_PING_IMAGE
    this.log.debug('Running network ping canary')
    return Promise.try(() => {
      Joi.assert(this.job, Joi.object({
        // FIXME Everywhere else defines this as `dockerHost`
        targetDockerUrl: Joi.string().uri({scheme: ['http']}).required(),
        targetIps: Joi.array().min(1).items(Joi.string().ip()).required(),
        targetOrg: Joi.number().required()
      }).required())
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
        .catch(Swarm.InvalidHostError, (err) => {
          throw new TaskFatalError(
            'khronos:canary:network-ping',
            'Host does not exist',
            { err: err, job: this.job }
          )
        })
    })
    .then(() => {
      this.monitorTags = ['org:' + this.job.targetOrg]
      this.docker = new Docker(this.job.targetDockerUrl)
      this.log.debug('Pulling network ping container')
      return this.docker.pull(PING_IMAGE)
    })
    .then(() => {
      this.log.debug('Running network ping container')
      return Promise
        .fromCallback((cb) => {
          const targetIps = this.job.targetIps.join(' ')
          const cmd = [
            'bash',
            '-c',
            process.env.RUNNABLE_WAIT_FOR_WEAVE + 'node index.js ' + targetIps
          ]
          let pingLog = ''
          this.docker.client
            .run(PING_IMAGE, cmd, false, (err, data, container) => {
              cb(err, [data, container, pingLog])
            })
            .on('stream', (stream) => {
              stream.on('data', (l) => {
                pingLog += l.toString()
              })
            })
        })
        .spread((data, container, pingLog) => {
          // Ensure we have a container
          if (!container || !container.id) {
            this.log.warn({
              container: container
            }, 'Dockerode did not return container with valid id')
            throw new CanaryFailedError('Invalid container', {
              container: container
            })
          }

          // Enqueue the delete container job
          this.log.info({
            dockerHost: this.job.targetDockerUrl,
            containerId: container.id
          }, 'Enqueueing container delete')
          const targetQueue = 'khronos:containers:delete'
          return Promise
            .using(rabbitmqHelper([targetQueue]), (rabbitmq) => {
              rabbitmq.publish(targetQueue, {
                dockerHost: this.job.targetDockerUrl,
                containerId: container.id
              })
            })
            .return([data. pingLog])
        })
        .spread((data, pingLog) => {
          if (data.StatusCode === 55) {
            this.log.error({
              data: data,
              log: pingLog
            }, 'failed to attach network')
            throw new CanaryFailedError('failed to attach network', {
              log: pingLog,
              data: data
            })
          }

          if (data.StatusCode !== 0) {
            this.log.error({ data: data, log: pingLog }, 'ping failed')
            throw new CanaryFailedError('ping container had non-zero exit', {
              log: pingLog,
              data: data
            })
          }

          // output of runnable/heimdall will have ERR if any pings failed
          if (pingLog.includes('ERR')) {
            this.log.warn({ log: pingLog }, 'ping had errors')
            throw new CanaryFailedError('failed to ping a container', {
              log: pingLog
            })
          }

          this.log.trace({ log: pingLog }, 'ping complete')
        })
        .catch((err) => {
          this.log.error({ err: err }, 'failed to run container')
          throw new CanaryFailedError('Error trying to ping', { err: err })
        })
    })
  }
}
