'use strict'

require('loadenv')()

const Joi = require('joi')
const Promise = require('bluebird')
const TaskFatalError = require('ponos').TaskFatalError
const keypather = require('keypather')()
const _ = require('lodash')
const CanaryBase = require('tasks/canary/canary-base')
const CanaryFailedError = require('errors/canary-failed-error')
const Docker = require('models/docker')
const mongodbHelper = require('tasks/utils/mongodb')
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

const schema = Joi.object({
  // FIXME Everywhere else defines this as `dockerHost`
  targetDockerUrl: Joi.string().uri({scheme: ['http']}).required(),
  targetIps: Joi.array().min(1).items(Joi.string().ip()).required(),
  targetOrg: Joi.number().required(),
  targetCvs: Joi.array().min(1).items(Joi.string()).required(),
  targetHosts: Joi.array().min(1).items(Joi.string()).required(),
  targetContainers: Joi.array().min(1).items(Joi.string()).required(),
  tid: Joi.string()
}).required()

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
      Joi.assert(this.job, schema)
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
      return Promise.using(mongodbHelper(), (mongoClient) => {
        const ids = this.job.targetCvs.map(mongoClient.newObjectID)
        return mongoClient.fetchContextVersionsAsync({
          _id: {
            $in: ids
          }
        })
        .then((cvs) => {
          this.log.debug('Filtering container that were run on removed dock')
          // array of arrays [ip, cvId, host, containerId]
          const zippedData = _.zip(this.job.targetIps, cvs, this.job.targetHosts, this.job.targetContainers)
          const filteredByActiveCvs = ipsToCvs.filter((data) => {
            // data is tuple where first element is cv
            return !keypather.get(pair, '[1].dockRemoved')
          })
          return filteredByActiveCvs
        })
        .catch((err) => {
          throw new TaskFatalError(
            'khronos:canary:network-ping',
            'Task failed due to database error',
            { err: err }
          )
        })
      })
    })
    .then((containersData) => {
      this.log.debug('Running network ping container')
      return Promise
        .fromCallback((cb) => {
          const ips = containersData.map(_.first)
          const targetIps = ips.join(' ')
          const cmd = [
            'bash',
            '-c',
            process.env.RUNNABLE_WAIT_FOR_WEAVE + 'node index.js ' + targetIps
          ]
          let pingLog = ''
          this.docker.client
            .run(PING_IMAGE, cmd, false, (err, data, pingContainer) => {
              cb(err, [data, pingContainer, pingLog])
            })
            .on('stream', (stream) => {
              stream.on('data', (l) => {
                pingLog += l.toString()
              })
            })
        })
        .catch((err) => {
          this.log.error({ err: err }, 'failed to run container')
          throw new CanaryFailedError('Error trying to ping', { err: err })
        })
        .spread((data, pingContainer, pingLog) => {
          // Ensure we have a container
          if (!container || !container.id) {
            this.log.warn({
              container: pingContainer
            }, 'Dockerode did not return container with valid id')
            throw new CanaryFailedError('Invalid container', {
              container: pingContainer
            })
          }

          // Enqueue the delete container job
          this.log.info({
            dockerHost: this.job.targetDockerUrl,
            containerId: pingContainer.id
          }, 'Enqueueing container delete')
          const targetQueue = 'khronos:containers:delete'
          return Promise
            .using(rabbitmqHelper([targetQueue]), (rabbitmq) => {
              rabbitmq.publish(targetQueue, {
                dockerHost: this.job.targetDockerUrl,
                containerId: pingContainer.id
              })
            })
            .return([data, pingContainer, pingLog])
        })
        .spread((data, pingContainer, pingLog) => {
          var containerId = keypather.get(pingContainer, 'id')
          if (data.StatusCode === 55) {
            this.log.error({
              data: data,
              log: pingLog,
              containerId: containerId
            }, 'failed to attach network')
            throw new CanaryFailedError('failed to attach network', {
              log: pingLog,
              data: data,
              containerId: containerId
            })
          }

          if (data.StatusCode !== 0) {
            this.log.error({
              data: data,
              log: pingLog,
              containerId: containerId
            }, 'ping failed')
            throw new CanaryFailedError('ping container had non-zero exit', {
              log: pingLog,
              data: data,
              containerId: containerId
            })
          }

          // output of runnable/heimdall will have ERR if any pings failed
          if (pingLog.includes('ERR')) {
            this.log.warn({
              log: pingLog,
              containerId: containerId
            }, 'ping had errors')
            // parse logs into array of lines
            const logLines = pingLog.split('\n')
            // filter only errored lines
            const erroredLines = logLines.filter((line) => {
              return line.includes('ERR')
            })
            // find ip for errored lines
            const erroredIps = erroredLines.map((line) => {
              const ip = line.split(': ERR:') || ''
              return ip.trim()
            })
            // find errored containers
            const erroredContainers = erroredIps.map((ip) {
              return containersData.find((containerData) => {
                return containersData[0] === ip
              })
            })
            // for each errored container emit new job
            const targetQueue = 'instance.container.health-check.failed'
            return Promise
              .using(rabbitmqHelper([targetQueue]), (rabbitmq) => {
                erroredContainers.map(function (containerData) {
                  rabbitmq.publish(targetQueue, {
                    host: containerData[2],
                    id: containerData[3]
                  })
                })
                throw new CanaryFailedError('failed to ping a container', {
                  log: pingLog,
                  containerId: containerId
                })
              })
          }

          this.log.trace({
            log: pingLog,
            containerId: containerId
          }, 'ping complete')
        })
    })
  }
}
