'use strict'

require('loadenv')({ debugName: 'khronos:test' })

const Promise = require('bluebird')
var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
var Bunyan = require('bunyan')
var rabbitmq = require('models/rabbitmq')
var sinon = require('sinon')
require('sinon-as-promised')(Promise)
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal
var MongoDB = require('models/mongodb')

// internal (being tested)
var verifyContainer = require('tasks/containers/check-against-mongo')

describe('Check Container Against Mongo Task', function () {
  var testJob = {
    dockerHost: 'http://example.com',
    containerId: 4
  }

  beforeEach(function () {
    sinon.stub(Bunyan.prototype, 'error').returns()
    sinon.stub(rabbitmq, 'publishTask').resolves()
    sinon.stub(MongoDB.prototype, 'close').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'connect').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'fetchInstances').yieldsAsync()
  })
  afterEach(function () {
    Bunyan.prototype.error.restore()
    rabbitmq.publishTask.restore()
    MongoDB.prototype.close.restore()
    MongoDB.prototype.connect.restore()
    MongoDB.prototype.fetchInstances.restore()
  })

  describe('Parameter Errors', function () {
    it('should throw an error on missing containerId', function () {
      var job = { dockerHost: 'http://example.com' }
      return assert.isRejected(
        verifyContainer(job),
        WorkerStopError,
        /containerId.+required/
      )
    })

    it('should throw an error on missing dockerHost', function () {
      var job = { containerId: 'deadbeef' }
      return assert.isRejected(
        verifyContainer(job),
        WorkerStopError,
        /dockerHost.+required/
      )
    })
  })

  describe('MongoDB Error', function () {
    beforeEach(function () {
      MongoDB.prototype.fetchInstances.yieldsAsync(new Error('foobar'))
    })

    it('should thrown the error', function () {
      return assert.isRejected(
        verifyContainer(testJob),
        Error,
        'foobar'
      )
        .then(function () {
          sinon.assert.notCalled(rabbitmq.publishTask)
        })
    })
  })

  it('should not remove the container if it is in mongo', function () {
    MongoDB.prototype.fetchInstances.yieldsAsync(null, [{ _id: 7 }])
    return assert.isFulfilled(verifyContainer(testJob))
      .then(function (result) {
        sinon.assert.notCalled(rabbitmq.publishTask)
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          containerId: 4,
          containerRemoveTaskQueued: false,
          instanceId: '7'
        })
      })
  })

  it('should enqueue a job to remove the container', function () {
    MongoDB.prototype.fetchInstances.yieldsAsync(null, [])
    return assert.isFulfilled(verifyContainer(testJob))
      .then(function (result) {
        sinon.assert.calledOnce(rabbitmq.publishTask)
        sinon.assert.calledWithExactly(
          rabbitmq.publishTask,
          'khronos:containers:remove',
          testJob
        )
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          containerId: 4,
          containerRemoveTaskQueued: true
        })
      })
  })
})
