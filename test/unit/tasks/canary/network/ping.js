'use strict'

require('loadenv')('khronos:test')

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

// internal (being tested)
const pingCanary = require('tasks/canary/network/ping')

// TODO anand: flesh out the unit tests for this canary
describe('Network Ping Canary', () => {
  const testTartgetIps = ['10.0.0.1', '10.0.0.2']
  const mock = {
    job: {
      targetDockerUrl: 'http://1.2.3.4:4242',
      targetIps: testTartgetIps,
      targetOrg: 123123
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