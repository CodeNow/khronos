'use strict'

require('loadenv')({ debugName: 'khronos:test' })

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
const rabbitmq = require('models/rabbitmq')
var sinon = require('sinon')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal
var MongoDB = require('models/mongodb')

// internal (being tested)
var checkImageAgainstContextVersions = require('tasks/images/check-against-context-versions')

describe('Image Check Against Context Version', function () {
  var testJob = {
    dockerHost: 'http://example.com',
    imageId: process.env.KHRONOS_DOCKER_REGISTRY + '/100/bar:507c7f79bcf86cd7994f6c0e'
  }

  beforeEach(function () {
    sinon.stub(rabbitmq, 'publishTask').resolves()
    sinon.stub(MongoDB.prototype, 'close').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'connect').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'countContextVersions').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'newObjectID').returnsArg(0)
  })
  afterEach(function () {
    rabbitmq.publishTask.restore()
    MongoDB.prototype.close.restore()
    MongoDB.prototype.connect.restore()
    MongoDB.prototype.countContextVersions.restore()
    MongoDB.prototype.newObjectID.restore()
  })

  describe('Parameter Errors', function () {
    it('should throw an error on missing imageId', function () {
      return assert.isRejected(
        checkImageAgainstContextVersions({ dockerHost: 'http://example.com' }),
        WorkerStopError,
        /imageId.+required/
      )
    })

    it('should throw an error on missing dockerHost', function () {
      return assert.isRejected(
        checkImageAgainstContextVersions({ imageId: 'deadbeef' }),
        WorkerStopError,
        /dockerHost.+required/
      )
    })
  })
  describe('Regex Error', function () {
    it('should throw the error', function () {
      return assert.isRejected(
        checkImageAgainstContextVersions({
          dockerHost: 'http://example.com',
          imageId: '/100/bar:507c7f79bcf86cd7994f6c0e'
        }),
        WorkerStopError,
        /imageId.+scheme/
      )
        .then(function () {
          sinon.assert.notCalled(rabbitmq.publishTask)
        })
    })
  })

  describe('MongoDB Error', function () {
    beforeEach(function () {
      MongoDB.prototype.countContextVersions.yieldsAsync(new Error('foobar'))
    })

    it('should throw the error', function () {
      return assert.isRejected(
        checkImageAgainstContextVersions(testJob),
        Error,
        'foobar'
      )
        .then(function () {
          sinon.assert.notCalled(rabbitmq.publishTask)
        })
    })
  })

  it('should fetch context versions for the exact id', function () {
    MongoDB.prototype.countContextVersions.yields(null, 1)
    return assert.isFulfilled(checkImageAgainstContextVersions(testJob))
      .then(function (result) {
        sinon.assert.calledWithExactly(
          MongoDB.prototype.countContextVersions,
          {
            _id: '507c7f79bcf86cd7994f6c0e'
          },
          sinon.match.func
        )
      })
  })

  it('should not remove the container if the context version is in mongo', function () {
    MongoDB.prototype.countContextVersions.yields(null, 1)
    return assert.isFulfilled(checkImageAgainstContextVersions(testJob))
      .then(function (result) {
        sinon.assert.notCalled(rabbitmq.publishTask)
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          imageId: process.env.KHRONOS_DOCKER_REGISTRY + '/100/bar:507c7f79bcf86cd7994f6c0e',
          imageRemoveTaskQueued: false
        })
      })
  })

  it('should remove the container if the context versionId isn\'t an objectId', function () {
    MongoDB.prototype.countContextVersions.yields(null, 1)
    return assert.isFulfilled(checkImageAgainstContextVersions({
      dockerHost: 'http://example.com',
      imageId: process.env.KHRONOS_DOCKER_REGISTRY + '/100/bar:baz'
    }))
      .then(function (result) {
        sinon.assert.calledOnce(rabbitmq.publishTask)
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          imageId: process.env.KHRONOS_DOCKER_REGISTRY + '/100/bar:baz',
          imageRemoveTaskQueued: true
        })
      })
  })

  it('should enqueue a job to remove the container if no context version was found', function () {
    MongoDB.prototype.countContextVersions.yields(null, 0)
    return assert.isFulfilled(checkImageAgainstContextVersions(testJob))
      .then(function (result) {
        sinon.assert.calledOnce(rabbitmq.publishTask)
        sinon.assert.calledWithExactly(
          rabbitmq.publishTask,
          'khronos:images:remove',
          testJob
        )
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          imageId: process.env.KHRONOS_DOCKER_REGISTRY + '/100/bar:507c7f79bcf86cd7994f6c0e',
          imageRemoveTaskQueued: true
        })
      })
  })
})
