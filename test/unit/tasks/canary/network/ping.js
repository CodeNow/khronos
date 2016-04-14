'use strict'

require('loadenv')('khronos:test')

const chai = require('chai')
const assert = chai.assert
chai.use(require('chai-as-promised'))

// external
const noop = require('101/noop')
const Promise = require('bluebird')
const sinon = require('sinon')

// internal
const CanaryBase = require('tasks/canary/canary-base')
const Docker = require('models/docker')
const Hermes = require('runnable-hermes')
const Swarm = require('models/swarm')

// internal (being tested)
const pingCanary = require('tasks/canary/network/ping')

// TODO anand: flesh out the unit tests for this canary
describe('Rebuild Canary', () => {
  const cleanupQueue = 'khronos:canary:network-cleanup'
  const mock = {
    job: {
      targetDockerUrl: 'http://1.2.3.4:4242'
    }
  }

  beforeEach(() => {
    sinon.stub(CanaryBase.prototype, 'handleSuccess')
    sinon.stub(CanaryBase.prototype, 'handleCanaryError')
    sinon.stub(CanaryBase.prototype, 'handleGenericError')
    sinon.stub(Swarm.prototype, 'checkHostExists')
    sinon.stub(Docker.prototype, 'pull')
    sinon.stub(Hermes.prototype, 'publish')
  })

  afterEach(() => {
    CanaryBase.prototype.handleSuccess.restore()
    CanaryBase.prototype.handleCanaryError.restore()
    CanaryBase.prototype.handleGenericError.restore()
    Swarm.prototype.checkHostExists.restore()
    Docker.prototype.pull.restore()
    Hermes.prototype.publish.restore()
  })

  describe('on success', () => {
    it('should enqueue the cleanup task', () => {
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(Hermes.prototype.publish)
        sinon.assert.calledWith(Hermes.prototype.publish, cleanupQueue)
        assert.deepEqual(
          Hermes.prototype.publish.firstCall.args[1],
          { dockerHost: mock.job.targetDockerUrl }
        )
      })
    })
  }) // end 'on success'

  describe('on failure', () => {
    beforeEach(() => {
      Swarm.prototype.checkHostExists
        .rejects(new Swarm.InvalidHostError('Dock not there'))
    })

    it('should cleanup the test containers', () => {
      return pingCanary(mock.job).then(() => {
        sinon.assert.calledOnce(CanaryBase.prototype.handleGenericError)
        sinon.assert.calledOnce(Hermes.prototype.publish)
        sinon.assert.calledWith(Hermes.prototype.publish, cleanupQueue)
        assert.deepEqual(
          Hermes.prototype.publish.firstCall.args[1],
          { dockerHost: mock.job.targetDockerUrl }
        )
      })
    })
  }) // end 'on failure'
})
