'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
var Bunyan = require('bunyan')
var chai = require('chai')
var rabbitmq = require('models/rabbitmq')
var sinon = require('sinon')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal
var Docker = require('models/docker')
const Swarm = require('models/swarm')

// internal (being tested)
var weavePruneDock = require('tasks/weave/prune-dock')

const assert = chai.assert
chai.use(require('chai-as-promised'))
require('sinon-as-promised')(require('bluebird'))

describe('Delete Weave Container Dock Task', function () {
  beforeEach(function () {
    sinon.stub(Bunyan.prototype, 'error').returns()
    sinon.stub(Docker.prototype, 'getContainers').resolves([])
    sinon.stub(Swarm.prototype, 'checkHostExists').returns(true)
    sinon.stub(rabbitmq, 'publishTask').returns()
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
          weavePruneDock({}),
          WorkerStopError,
          /dockerHost.+required/
        )
      })
    })

    describe('if docker throws an error', function () {
      beforeEach(function () {
        Docker.prototype.getContainers.yieldsAsync(new Error('foobar'))
      })

      it('should throw the error', function () {
        return assert.isRejected(
          weavePruneDock({ dockerHost: 'http://example.com' }),
          Error,
          'foobar'
        )
      })
    })
  })

  describe('with a no containers on a host', function () {
    it('should not enqueue any task', function () {
      return assert.isFulfilled(weavePruneDock({ dockerHost: 'http://example.com' }))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.getContainers)
          sinon.assert.calledWithExactly(
            Docker.prototype.getContainers,
            { filters: '{"status":["exited"]}' },
            sinon.match.array,
            undefined
          )
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
      return assert.isFulfilled(weavePruneDock({ dockerHost: 'http://example.com' }))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.getContainers)
          sinon.assert.calledWithExactly(
            Docker.prototype.getContainers,
            { filters: '{"status":["exited"]}' },
            sinon.match.array,
            undefined
          )
          sinon.assert.calledOnce(rabbitmq.publishTask)
          assert.equal(result, 1, 'result is 0')
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
      return assert.isFulfilled(weavePruneDock({ dockerHost: 'http://example.com' }))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.getContainers)
          sinon.assert.calledWithExactly(
            Docker.prototype.getContainers,
            { filters: '{"status":["exited"]}' },
            sinon.match.array,
            undefined
          )
          sinon.assert.calledTwice(rabbitmq.publishTask)
          assert.equal(result, 2, 'result is 0')
        })
    })
  })
})
