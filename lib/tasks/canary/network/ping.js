'use strict'

require('loadenv')()

const joi = require('joi')
const Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')
const keypather = require('keypather')()
const _ = require('lodash')
const CanaryBase = require('tasks/canary/canary-base')
const CanaryFailedError = require('errors/canary-failed-error')
const Docker = require('models/docker')
const mongodbHelper = require('tasks/utils/mongodb')
const rabbitmq = require('models/rabbitmq')
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

const schema = joi.object({
  // FIXME Everywhere else defines this as `dockerHost`
  targetDockerUrl: joi.string().uri({scheme: ['http']}).required(),
  targetIps: joi.array().min(1).items(joi.string().ip()).required(),
  targetOrg: joi.number().required(),
  targetCvs: joi.array().min(1).items(joi.string()).required(),
  targetHosts: joi.array().min(1).items(joi.string()).required(),
  targetContainers: joi.array().min(1).items(joi.string()).required(),
  tid: joi.string()
}).required()

const runNetworkContainer = (dockerUrl, containersData) => {
  const PING_IMAGE = process.env.NETWORK_PING_IMAGE
  return Promise.fromCallback((cb) => {
    const docker = new Docker(dockerUrl)
    const ips = containersData.map(_.first)
    const targetIps = ips.join(' ')
    const cmd = [
      'bash',
      '-c',
      process.env.RUNNABLE_WAIT_FOR_WEAVE + 'node index.js ' + targetIps
    ]
    let pingLog = ''
    docker.client
      .run(PING_IMAGE, cmd, false, (err, data, pingContainer) => {
        cb(err, [data, pingContainer, pingLog])
      })
      .on('stream', (stream) => {
        stream.on('data', (l) => {
          pingLog += l.toString()
        })
      })
  })
}

const parseErroredIpsFromLog = (pingLog) => {
  const logLines = pingLog.split('\n') || []
  // filter only errored lines
  const erroredLines = logLines.filter((line) => {
    return line.includes('ERR')
  })
  // find ip for errored lines
  const erroredIps = erroredLines.map((line) => {
    const tokens = line.split(': ERR:') || []
    const ip = tokens[0] || ''
    return ip.trim()
  })
  return erroredIps
}

module.exports.parseErroredIpsFromLog = parseErroredIpsFromLog

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
    this.log.debug('Running network ping canary')
    return Promise.try(() => {
      joi.assert(this.job, schema)
    })
    .catch((err) => {
      throw new WorkerStopError(
        'Invalid job',
        { originalError: err }
      )
    })
    .then(() => {
      const swarm = new Swarm()
      return swarm.checkHostExists(this.job.targetDockerUrl)
        .catch(Swarm.InvalidHostError, (err) => {
          throw new WorkerStopError(
            'Host does not exist',
            { originalError: err }
          )
        })
    })
    .then(() => {
      const PING_IMAGE = process.env.NETWORK_PING_IMAGE
      this.monitorTags = ['org:' + this.job.targetOrg]
      const docker = new Docker(this.job.targetDockerUrl)
      this.log.debug('Pulling network ping container')
      return docker.pull(PING_IMAGE)
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
          const filteredByActiveCvs = zippedData.filter((data) => {
            // data is tuple with 4 elements where first element is cv
            return !keypather.get(data, '[1].dockRemoved')
          })
          return filteredByActiveCvs
        })
        .catch((err) => {
          throw new WorkerStopError(
            'Task failed due to database error',
            { originalError: err }
          )
        })
      })
    })
    .then((containersData) => {
      this.log.debug('Running network ping container')
      return runNetworkContainer(this.job.targetDockerUrl, containersData)
        .catch((err) => {
          this.log.error({ err: err }, 'failed to run container')
          throw new CanaryFailedError('Error trying to ping', { err: err })
        })
        .spread((data, pingContainer, pingLog) => {
          this.log.trace({
            container: pingContainer,
            data: data,
            log: pingLog
          }, 'network container result')
          // Ensure we have a container
          if (!pingContainer || !pingContainer.id) {
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
          rabbitmq.publishTask(targetQueue, {
            dockerHost: this.job.targetDockerUrl,
            containerId: pingContainer.id
          })
          return [data, pingContainer, pingLog]
        })
        .spread((data, pingContainer, pingLog) => {
          const containerId = keypather.get(pingContainer, 'id')
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
            const erroredIps = parseErroredIpsFromLog(pingLog)
            this.log.trace({ ips: erroredIps }, 'errored ips')
            // find errored containers
            const erroredContainers = erroredIps.map((ip) => {
              return containersData.find((containerData) => {
                return containerData[0] === ip
              })
            })
            this.log.trace({ containers: erroredContainers }, 'errored containers')
            // for each errored container emit new job
            const targetQueue = 'instance.container.health-check.failed'
            return Promise.map(erroredContainers, (containerData) => {
              return rabbitmq.publishEvent(targetQueue, {
                host: containerData[2],
                id: containerData[3]
              })
            }).then(() => {
              throw new CanaryFailedError('failed to ping a container', {
                log: pingLog,
                containerId: containerId,
                erroredContainers: erroredContainers
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
