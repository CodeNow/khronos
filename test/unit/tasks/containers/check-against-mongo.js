'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
var Bunyan = require('bunyan')
var Hermes = require('runnable-hermes')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

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
    sinon.stub(Hermes.prototype, 'close').yieldsAsync()
    sinon.stub(Hermes.prototype, 'connect').yieldsAsync()
    sinon.stub(Hermes.prototype, 'publish').returns()
    sinon.stub(MongoDB.prototype, 'close').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'connect').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'fetchInstances').yieldsAsync()
  })
  afterEach(function () {
    Bunyan.prototype.error.restore()
    Hermes.prototype.close.restore()
    Hermes.prototype.connect.restore()
    Hermes.prototype.publish.restore()
    MongoDB.prototype.close.restore()
    MongoDB.prototype.connect.restore()
    MongoDB.prototype.fetchInstances.restore()
  })

  describe('Parameter Errors', function () {
    it('should throw an error on missing containerId', function () {
      var job = { dockerHost: 'http://example.com' }
      return assert.isRejected(
        verifyContainer(job),
        TaskFatalError,
        /containerId.+required/
      )
    })

    it('should throw an error on missing dockerHost', function () {
      var job = { containerId: 'deadbeef' }
      return assert.isRejected(
        verifyContainer(job),
        TaskFatalError,
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
          sinon.assert.notCalled(Hermes.prototype.publish)
        })
    })
  })

  describe('Rabbitmq Error', function () {
    beforeEach(function () {
      Hermes.prototype.connect.yieldsAsync(new Error('foobar'))
    })

    it('should thrown the error', function () {
      return assert.isRejected(
        verifyContainer(testJob),
        Error,
        'foobar'
      )
        .then(function () {
          sinon.assert.notCalled(Hermes.prototype.publish)
        })
    })
  })

  it('should not remove the container if it is in mongo', function () {
    MongoDB.prototype.fetchInstances.yieldsAsync(null, [{ _id: 7 }])
    return assert.isFulfilled(verifyContainer(testJob))
      .then(function (result) {
        sinon.assert.notCalled(Hermes.prototype.publish)
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
        sinon.assert.calledOnce(Hermes.prototype.publish)
        sinon.assert.calledWithExactly(
          Hermes.prototype.publish,
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
