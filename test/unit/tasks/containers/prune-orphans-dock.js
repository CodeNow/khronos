'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
const Bunyan = require('bunyan')
const chai = require('chai')
const rabbitmq = require('models/rabbitmq')
const sinon = require('sinon')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal
const Docker = require('models/docker')
const Swarm = require('models/swarm')

// internal (being tested)
const enqueueContainerVerificationTask =
  require('tasks/containers/prune-orphans-dock')

const assert = chai.assert
chai.use(require('chai-as-promised'))
require('sinon-as-promised')(require('bluebird'))

describe('Prune Orphans Dock Task', function () {
  beforeEach(function () {
    sinon.stub(Bunyan.prototype, 'error').returns()
    sinon.stub(Docker.prototype, 'getContainers').resolves()
    sinon.stub(Swarm.prototype, 'checkHostExists').resolves(true)
    sinon.stub(rabbitmq, 'publishTask').resolves()
  })
  afterEach(function () {
    Bunyan.prototype.error.restore()
    Docker.prototype.getContainers.restore()
    Swarm.prototype.checkHostExists.restore()
    rabbitmq.publishTask.restore()
  })

  describe('errors', function () {
    describe('invalid arguments', function () {
      it('throws an error when missing dockerHost', function () {
        return assert.isRejected(
          enqueueContainerVerificationTask({}),
          WorkerStopError,
          /dockerHost.+required/
        )
      })
    })

    describe('if docker throws an error', function () {
      beforeEach(function () {
        Docker.prototype.getContainers.rejects(new Error('foobar'))
      })

      it('should throw the error', function () {
        return assert.isRejected(
          enqueueContainerVerificationTask({ dockerHost: 'http://example.com' }),
          Error,
          'foobar'
        )
      })
    })
  })

  describe('with a no containers on a host', function () {
    beforeEach(function () {
      Docker.prototype.getContainers.resolves([])
    })
    it('should not enqueue any task', function () {
      var job = { dockerHost: 'http://example.com' }
      return assert.isFulfilled(enqueueContainerVerificationTask(job))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.getContainers)
          sinon.assert.calledWithExactly(
            Docker.prototype.getContainers,
            {
              filters: '{"status":["exited"]}'
            },
            sinon.match.array,
            undefined
          )
          sinon.assert.notCalled(rabbitmq.publishTask)
          assert.equal(result, 0, 'result is 0')
        })
    })
  })

  describe('with a single container on a host', function () {
    beforeEach(function () {
      var containers = [{
        Id: 4
      }]
      Docker.prototype.getContainers.resolves(containers)
    })

    it('should enqueue a job to remove the container', function () {
      var job = { dockerHost: 'http://example.com' }
      return assert.isFulfilled(enqueueContainerVerificationTask(job))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.getContainers)
          sinon.assert.calledWithExactly(
            Docker.prototype.getContainers,
            {
              filters: '{"status":["exited"]}'
            },
            sinon.match.array,
            undefined
          )
          sinon.assert.calledOnce(rabbitmq.publishTask)
          sinon.assert.calledWithExactly(
            rabbitmq.publishTask,
            'containers.orphan.check-against-mongo',
            {
              dockerHost: 'http://example.com',
              containerId: 4
            }
          )
          assert.equal(result, 1, 'result is 1')
        })
    })
  })

  describe('with multiple containers on a host', function () {
    beforeEach(function () {
      var containers = [{
        Id: 4
      }, {
        Id: 5
      }]
      Docker.prototype.getContainers.resolves(containers)
    })

    it('should remove all the containers', function () {
      var job = { dockerHost: 'http://example.com' }
      return assert.isFulfilled(enqueueContainerVerificationTask(job))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.getContainers)
          sinon.assert.calledWithExactly(
            Docker.prototype.getContainers,
            {
              filters: '{"status":["exited"]}'
            },
            sinon.match.array,
            undefined
          )
          sinon.assert.calledTwice(rabbitmq.publishTask)
          sinon.assert.calledWithExactly(
            rabbitmq.publishTask,
            'containers.orphan.check-against-mongo',
            {
              dockerHost: 'http://example.com',
              containerId: 4
            }
          )
          sinon.assert.calledWithExactly(
            rabbitmq.publishTask,
            'containers.orphan.check-against-mongo',
            {
              dockerHost: 'http://example.com',
              containerId: 5
            }
          )
          assert.equal(result, 2, 'result is 2')
        })
    })
  })
})
