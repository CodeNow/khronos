'use strict'

require('loadenv')('khronos:test')

const ObjectID = require('mongodb').ObjectID
const chai = require('chai')
const assert = chai.assert
chai.use(require('chai-as-promised'))

// external
const Dockerode = require('dockerode')
const noop = require('101/noop')
const sinon = require('sinon')

// internal
const CanaryBase = require('tasks/canary/canary-base')
const Docker = require('models/docker')
const Hermes = require('runnable-hermes')
const Swarm = require('models/swarm')

// internal
const MongoDB = require('models/mongodb')
// internal (being tested)
const pingCanary = require('tasks/canary/network/ping')

// TODO anand: flesh out the unit tests for this canary
describe('Network Ping Canary', () => {
  const testTartgetIps = ['10.0.0.1', '10.0.0.2']
  const testTartgetCvs = ['5694d7935fa8721e00d5617e', '569be29c85890c1e00d7386a']
  const mock = {
    job: {
      targetDockerUrl: 'http://1.2.3.4:4242',
      targetIps: testTartgetIps,
      targetOrg: 123123,
      targetCvs: testTartgetCvs
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
    sinon.stub(Dockerode.prototype, 'run')
      .returns(mock.runEventEmitter)
      .yieldsAsync(null, mock.runData, mock.container)
    sinon.stub(Hermes.prototype, 'close').yieldsAsync()
    sinon.stub(Hermes.prototype, 'connect').yieldsAsync()
    sinon.stub(Hermes.prototype, 'publish')
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
    Dockerode.prototype.run.restore()
    Hermes.prototype.close.restore()
    Hermes.prototype.connect.restore()
    Hermes.prototype.publish.restore()
    Swarm.prototype.checkHostExists.restore()
  })

  after(function (done) {
    delete process.env.RUNNABLE_WAIT_FOR_WEAVE
    delete process.env.NETWORK_PING_IMAGE
    done()
  })

  describe('invalid job', () => {
    it('should throw TaskFatalError', () => {
      return pingCanary({}).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should throw TaskFatalError if url missing http', () => {
      return pingCanary({
        targetDockerUrl: '10.0.0.1:4242',
        targetIps: ['10.0.0.1'],
        targetOrg: 123
      }).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should throw TaskFatalError if url empty string', () => {
      return pingCanary({
        targetDockerUrl: '',
        targetIps: ['10.0.0.1'],
        targetOrg: 123
      }).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should throw TaskFatalError if ips are not strings', () => {
      return pingCanary({
        targetDockerUrl: 'http://10.0.0.1:4242',
        targetIps: [1, 2],
        targetOrg: 123
      }).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should throw TaskFatalError if ips are invalid', () => {
      return pingCanary({
        targetDockerUrl: 'http://10.0.0.1:4242',
        targetIps: ['a', 'b'],
        targetOrg: 123
      }).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should throw TaskFatalError if ips are not all strings', () => {
      return pingCanary({
        targetDockerUrl: 'http://10.0.0.1:4242',
        targetIps: ['10.0.0.1', [1]],
        targetOrg: 123
      }).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should throw TaskFatalError if org is not a number', () => {
      return pingCanary({
        targetDockerUrl: 'http://10.0.0.1:4242',
        targetIps: ['10.0.0.1'],
        targetOrg: 'org'
      }).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should throw TaskFatalError if cvs are not provided', () => {
      return pingCanary({
        targetDockerUrl: 'http://10.0.0.1:4242',
        targetIps: ['10.0.0.1'],
        targetOrg: 1
      }).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should throw TaskFatalError if cvs are not strings', () => {
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
      Dockerode.prototype.run.yieldsAsync(null, {
        StatusCode: 0
      })
      return pingCanary(mock.job).then(() => {
        const ips = testTartgetIps.join(' ')
        const cmd = [
          'bash',
          '-c',
          process.env.RUNNABLE_WAIT_FOR_WEAVE + 'node index.js ' + ips
        ]
        sinon.assert.calledOnce(Dockerode.prototype.run)
        sinon.assert.calledWith(
          Dockerode.prototype.run,
          process.env.NETWORK_PING_IMAGE,
          cmd,
          false
        )
      })
    })

    it('should cleanup the test container', () => {
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(Hermes.prototype.publish)
        sinon.assert.calledWith(
          Hermes.prototype.publish,
          'khronos:containers:delete'
        )
        assert.deepEqual(
          Hermes.prototype.publish.firstCall.args[1],
          {
            dockerHost: mock.job.targetDockerUrl,
            containerId: mock.container.id
          }
        )
      })
    })

    describe('without container', () => {
      beforeEach(() => {
        Dockerode.prototype.run.yieldsAsync(null, mock.runData, null)
      })

      it('should not cleanup the test container', () => {
        return pingCanary(mock.job).then(() => {
          assert.equal(Hermes.prototype.publish.callCount, 0)
        })
      })
    })

    describe('with malformed container', () => {
      beforeEach(() => {
        Dockerode.prototype.run.yieldsAsync(null, mock.runData, {})
      })

      it('should not cleanup the test container', () => {
        return pingCanary(mock.job).then(() => {
          assert.equal(Hermes.prototype.publish.callCount, 0)
        })
      })
    })
  }) // end 'on success'

  describe('run failures', function () {
    beforeEach(() => {
      Swarm.prototype.checkHostExists.resolves()
      Docker.prototype.pull.resolves()
    })

    it('should TaskFatal on db error', () => {
      MongoDB.prototype.fetchContextVersions.yieldsAsync(new Error('Mongo error'))
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
      })
    })

    it('should fail canary on error', () => {
      Dockerode.prototype.run.yieldsAsync(new Error('bad'))
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleCanaryError)
        assert.match(
          CanaryBase.prototype.handleCanaryError.firstCall.args[0].message,
          /Error trying to ping/i
        )
      })
    })

    it('should fail canary on network attach error', () => {
      Dockerode.prototype.run
        .yieldsAsync(null, { StatusCode: 55 }, mock.container)
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleCanaryError)
        assert.match(
          CanaryBase.prototype.handleCanaryError.firstCall.args[0].message,
          /failed to attach network/i
        )
      })
    })

    it('should fail canary on non-zero', () => {
      Dockerode.prototype.run
        .yieldsAsync(null, { StatusCode: 123 }, mock.container)
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleCanaryError)
        assert.match(
          CanaryBase.prototype.handleCanaryError.firstCall.args[0].message,
          /ping container had non-zero exit/i
        )
      })
    })

    it('should fail ERR in logs', () => {
      Dockerode.prototype.run.restore()
      sinon.stub(Dockerode.prototype, 'run', function (a, b, c, callback) {
        return {
          on: (name, cb) => {
            assert.equal(name, 'stream')
            cb({
              on: function (name, cb) {
                assert.equal(name, 'data')
                cb('10.0.0.0: ERR: bad happened')
                callback(null, { StatusCode: 0 }, mock.container)
              }
            })
          }
        }
      })
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleCanaryError)
        assert.match(
          CanaryBase.prototype.handleCanaryError.firstCall.args[0].message,
          /failed to ping a container/i
        )
      })
    })
  }) // end run failures
})
