'use strict'

require('loadenv')('khronos:test')

const Promise = require('bluebird')
const ObjectID = require('mongodb').ObjectID
const chai = require('chai')
const assert = chai.assert
chai.use(require('chai-as-promised'))

// external
const noop = require('101/noop')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

// internal
const CanaryBase = require('tasks/canary/canary-base')
const Docker = require('models/docker')
const rabbitmq = require('models/rabbitmq')
const Swarm = require('models/swarm')

// internal
const MongoDB = require('models/mongodb')
// internal (being tested)
const pingCanary = require('tasks/canary/network/ping')

// TODO anand: flesh out the unit tests for this canary
describe('Network Ping Canary', () => {
  const testTartgetIps = ['10.0.0.1', '10.0.0.2']
  const testTartgetCvs = ['5694d7935fa8721e00d5617e', '569be29c85890c1e00d7386a']
  const testTartgetHosts = ['10.8.0.124', '10.8.0.125']
  const testTartgetContainers = ['bdd93ce23cce657a0066b442db5536e96137cca8715259e0c838ae83c8e03f66', '46554b8c8deae776929f4cd34d5c4256628d4f0bc0499b2a54f18d84cc719c7c']
  const mock = {
    job: {
      targetDockerUrl: 'http://1.2.3.4:4242',
      targetIps: testTartgetIps,
      targetOrg: 123123,
      targetCvs: testTartgetCvs,
      targetHosts: testTartgetHosts,
      targetContainers: testTartgetContainers
    },
    runData: {
      StatusCode: 0
    },
    runEventEmitter: {
      on: noop
    },
    container: {
      id: 'some-container-id'
    }
  }

  describe('parseErroredIpsFromLog', () => {
    it('should parse 2 errored ips', () => {
      const log = '10.0.0.5 : ERR: some error\n10.0.0.5 :OK:\n10.0.0.6 : ERR:'
      const ips = pingCanary.parseErroredIpsFromLog(log)
      assert.lengthOf(ips, 2)
      assert.equal(ips[0], '10.0.0.5')
      assert.equal(ips[1], '10.0.0.6')
    })

    it('should return [] if no ips errored', () => {
      const log = '10.0.0.5 :OK:\n10.0.0.6 :OK:'
      const ips = pingCanary.parseErroredIpsFromLog(log)
      assert.lengthOf(ips, 0)
    })

    it('should return [] if logs is empty', () => {
      const log = ''
      const ips = pingCanary.parseErroredIpsFromLog(log)
      assert.lengthOf(ips, 0)
    })
  })

  before(function () {
    process.env.RUNNABLE_WAIT_FOR_WEAVE = 'wait;for;weave;'
    process.env.NETWORK_PING_IMAGE = 'runnable/hemingdal'
  })

  beforeEach(() => {
    sinon.stub(MongoDB.prototype, 'close').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'connect').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'fetchContextVersions')
      .yieldsAsync(null, testTartgetCvs.map((cv) => {
        return {_id: cv, dockRemoved: false}
      }))
    sinon.stub(CanaryBase.prototype, 'handleCanaryError')
    sinon.stub(CanaryBase.prototype, 'handleGenericError')
    sinon.stub(CanaryBase.prototype, 'handleSuccess')
    sinon.stub(Docker.prototype, 'pull')
    sinon.stub(Docker.prototype, 'runContainer').resolves([mock.runData, mock.container])
    sinon.stub(rabbitmq, 'publishTask').resolves()
    sinon.stub(rabbitmq, 'publishEvent').resolves()
    sinon.stub(Swarm.prototype, 'checkHostExists')
  })

  afterEach(() => {
    MongoDB.prototype.close.restore()
    MongoDB.prototype.connect.restore()
    MongoDB.prototype.fetchContextVersions.restore()
    CanaryBase.prototype.handleCanaryError.restore()
    CanaryBase.prototype.handleGenericError.restore()
    CanaryBase.prototype.handleSuccess.restore()
    Docker.prototype.pull.restore()
    Docker.prototype.runContainer.restore()
    rabbitmq.publishTask.restore()
    rabbitmq.publishEvent.restore()
    Swarm.prototype.checkHostExists.restore()
  })

  after(function (done) {
    delete process.env.RUNNABLE_WAIT_FOR_WEAVE
    delete process.env.NETWORK_PING_IMAGE
    done()
  })

  describe('invalid job', () => {
    it('should throw WorkerStopError', () => {
      return pingCanary({}).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should throw WorkerStopError if url missing http', () => {
      return pingCanary({
        targetDockerUrl: '10.0.0.1:4242',
        targetIps: ['10.0.0.1'],
        targetOrg: 123
      }).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should throw WorkerStopError if url empty string', () => {
      return pingCanary({
        targetDockerUrl: '',
        targetIps: ['10.0.0.1'],
        targetOrg: 123
      }).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should throw WorkerStopError if ips are not strings', () => {
      return pingCanary({
        targetDockerUrl: 'http://10.0.0.1:4242',
        targetIps: [1, 2],
        targetOrg: 123
      }).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should throw WorkerStopError if ips are invalid', () => {
      return pingCanary({
        targetDockerUrl: 'http://10.0.0.1:4242',
        targetIps: ['a', 'b'],
        targetOrg: 123
      }).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should throw WorkerStopError if ips are not all strings', () => {
      return pingCanary({
        targetDockerUrl: 'http://10.0.0.1:4242',
        targetIps: ['10.0.0.1', [1]],
        targetOrg: 123
      }).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should throw WorkerStopError if org is not a number', () => {
      return pingCanary({
        targetDockerUrl: 'http://10.0.0.1:4242',
        targetIps: ['10.0.0.1'],
        targetOrg: 'org'
      }).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should throw WorkerStopError if cvs are not provided', () => {
      return pingCanary({
        targetDockerUrl: 'http://10.0.0.1:4242',
        targetIps: ['10.0.0.1'],
        targetOrg: 1
      }).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should throw WorkerStopError if cvs are not strings', () => {
      return pingCanary({
        targetDockerUrl: 'http://10.0.0.1:4242',
        targetIps: ['10.0.0.1'],
        targetCvs: [1],
        targetOrg: 1
      }).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })
  }) // end invalid job

  describe('on success', () => {
    beforeEach(() => {
      Swarm.prototype.checkHostExists.resolves()
      Docker.prototype.pull.resolves()
    })

    it('should checkHostExists', () => {
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(Swarm.prototype.checkHostExists)
        sinon.assert.calledWith(
          Swarm.prototype.checkHostExists,
          mock.job.targetDockerUrl
        )
      })
    })

    it('should pull image', () => {
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(Docker.prototype.pull)
        sinon.assert.calledWith(
          Docker.prototype.pull,
          process.env.NETWORK_PING_IMAGE
        )
      })
    })

    it('should query db for cvs', () => {
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(MongoDB.prototype.fetchContextVersions)
        const cvs = testTartgetCvs.map((cv) => {
          return new ObjectID(cv)
        })
        sinon.assert.calledWith(
          MongoDB.prototype.fetchContextVersions,
          { _id: { $in: cvs } }
        )
      })
    })

    it('should run image', () => {
      Docker.prototype.runContainer.resolves([{
        StatusCode: 0
      }])
      return pingCanary(mock.job).then(() => {
        const ips = testTartgetIps.join(' ')
        const cmd = [
          'bash',
          '-c',
          process.env.RUNNABLE_WAIT_FOR_WEAVE + 'node index.js ' + ips
        ]
        sinon.assert.calledOnce(Docker.prototype.runContainer)
        sinon.assert.calledWith(
          Docker.prototype.runContainer,
          process.env.NETWORK_PING_IMAGE,
          cmd
        )
      })
    })

    it('should run image for one ip since one dock was removed', () => {
      Docker.prototype.runContainer.resolves([{
        StatusCode: 0
      }])
      const cvs = [
        {
          _id: testTartgetCvs[0],
          dockRemoved: false
        },
        {
          _id: testTartgetCvs[1],
          dockRemoved: true
        }
      ]
      MongoDB.prototype.fetchContextVersions.yieldsAsync(null, cvs)
      return pingCanary(mock.job).then(() => {
        const ips = testTartgetIps[0]
        const cmd = [
          'bash',
          '-c',
          process.env.RUNNABLE_WAIT_FOR_WEAVE + 'node index.js ' + ips
        ]
        sinon.assert.calledOnce(Docker.prototype.runContainer)
        sinon.assert.calledWith(
          Docker.prototype.runContainer,
          process.env.NETWORK_PING_IMAGE,
          cmd
        )
      })
    })

    it('should cleanup the test container', () => {
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(rabbitmq.publishTask)
        sinon.assert.calledWith(
          rabbitmq.publishTask,
          'containers.delete',
          {
            dockerHost: mock.job.targetDockerUrl,
            containerId: mock.container.id
          }
        )
      })
    })

    describe('without container', () => {
      beforeEach(() => {
        Docker.prototype.runContainer.resolves([mock.runData, null])
      })

      it('should not cleanup the test container', () => {
        return pingCanary(mock.job).then(() => {
          sinon.assert.notCalled(rabbitmq.publishTask)
        })
      })
    })

    describe('with malformed container', () => {
      beforeEach(() => {
        Docker.prototype.runContainer.resolves([mock.runData, {}])
      })

      it('should not cleanup the test container', () => {
        return pingCanary(mock.job).then(() => {
          sinon.assert.notCalled(rabbitmq.publishTask)
        })
      })
    })
  }) // end 'on success'

  describe('run failures', function () {
    beforeEach(() => {
      Swarm.prototype.checkHostExists.resolves()
      Docker.prototype.pull.resolves()
    })

    it('should workerstop and publish dock lost if no host found', () => {
      Swarm.prototype.checkHostExists.rejects(new Swarm.InvalidHostError('bad'))

      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(rabbitmq.publishEvent)
        sinon.assert.calledWith(rabbitmq.publishEvent, 'dock.lost', {
          host: mock.job.targetDockerUrl,
          githubOrgId: mock.job.targetOrg
        })
      })
    })

    it('should TaskFatal on db error', () => {
      MongoDB.prototype.fetchContextVersions.yieldsAsync(new Error('Mongo error'))
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should fail canary on error', () => {
      Docker.prototype.runContainer.rejects(new Error('bad'))
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleCanaryError)
        assert.match(
          CanaryBase.prototype.handleCanaryError.firstCall.args[0].message,
          /Error trying to ping/i
        )
      })
    })

    it('should fail canary on network attach error', () => {
      Docker.prototype.runContainer.resolves([{ StatusCode: 55 }, mock.container])
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleCanaryError)
        assert.match(
          CanaryBase.prototype.handleCanaryError.firstCall.args[0].message,
          /failed to attach network/i
        )
      })
    })

    it('should fail canary on non-zero', () => {
      Docker.prototype.runContainer.resolves([{ StatusCode: 123 }, mock.container])
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleCanaryError)
        assert.match(
          CanaryBase.prototype.handleCanaryError.firstCall.args[0].message,
          /ping container had non-zero exit/i
        )
      })
    })

    it('should fail ERR in logs', () => {
      const pingLog = testTartgetIps.map((ip) => {
        return ip + ': ERR: bad happened\n'
      }).join('\n')
      Docker.prototype.runContainer.resolves([{ StatusCode: 0 }, mock.container, pingLog])
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleCanaryError)
        assert.match(
          CanaryBase.prototype.handleCanaryError.firstCall.args[0].message,
          /failed to ping a container/i
        )
      })
    })

    it('should publish health-check.failed if ERR in logs', () => {
      const pingLog = testTartgetIps.map((ip) => {
        return ip + ': ERR: bad happened\n'
      }).join('\n')
      Docker.prototype.runContainer.resolves([{ StatusCode: 0 }, mock.container, pingLog])
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledTwice(rabbitmq.publishEvent)
        sinon.assert.calledWith(rabbitmq.publishEvent.getCall(0),
          'instance.container.health-check.failed',
          {
            id: testTartgetContainers[0],
            host: testTartgetHosts[0],
            githubOrgId: mock.job.targetOrg
          })
        sinon.assert.calledWith(rabbitmq.publishEvent.getCall(1),
          'instance.container.health-check.failed',
          {
            id: testTartgetContainers[1],
            host: testTartgetHosts[1],
            githubOrgId: mock.job.targetOrg
          })
      })
    })
  }) // end run failures
})
