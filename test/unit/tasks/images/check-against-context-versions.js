'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
var Hermes = require('runnable-hermes')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var MongoDB = require('models/mongodb')

// internal (being tested)
var checkImageAgainstContextVersions = require('tasks/images/check-against-context-versions')

describe('Image Check Against Context Version', function () {
  var testJob = {
    dockerHost: 'http://example.com',
    imageId: process.env.KHRONOS_DOCKER_REGISTRY + '/100/bar:baz'
  }

  beforeEach(function () {
    sinon.stub(Hermes.prototype, 'close').yieldsAsync()
    sinon.stub(Hermes.prototype, 'connect').yieldsAsync()
    sinon.stub(Hermes.prototype, 'publish').returns()
    sinon.stub(MongoDB.prototype, 'close').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'connect').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'countContextVersions').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'newObjectID').returnsArg(0)
  })
  afterEach(function () {
    Hermes.prototype.close.restore()
    Hermes.prototype.connect.restore()
    Hermes.prototype.publish.restore()
    MongoDB.prototype.close.restore()
    MongoDB.prototype.connect.restore()
    MongoDB.prototype.countContextVersions.restore()
    MongoDB.prototype.newObjectID.restore()
  })

  describe('Parameter Errors', function () {
    it('should throw an error on missing imageId', function () {
      return assert.isRejected(
        checkImageAgainstContextVersions({ dockerHost: 'http://example.com' }),
        TaskFatalError,
        /imageId.+required/
      )
    })

    it('should throw an error on missing dockerHost', function () {
      return assert.isRejected(
        checkImageAgainstContextVersions({ imageId: 'deadbeef' }),
        TaskFatalError,
        /dockerHost.+required/
      )
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
          sinon.assert.notCalled(Hermes.prototype.publish)
        })
    })
  })

  describe('Rabbitmq Error', function () {
    beforeEach(function () {
      MongoDB.prototype.countContextVersions.yields(null, 0)
      Hermes.prototype.connect.yieldsAsync(new Error('foobar'))
    })

    it('should thrown the error', function () {
      return assert.isRejected(
        checkImageAgainstContextVersions(testJob),
        Error,
        'foobar'
      )
        .then(function () {
          sinon.assert.notCalled(Hermes.prototype.publish)
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
            _id: 'baz'
          },
          sinon.match.func
        )
      })
  })

  it('should not remove the container if the context version is in mongo', function () {
    MongoDB.prototype.countContextVersions.yields(null, 1)
    return assert.isFulfilled(checkImageAgainstContextVersions(testJob))
      .then(function (result) {
        sinon.assert.notCalled(Hermes.prototype.publish)
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          imageId: process.env.KHRONOS_DOCKER_REGISTRY + '/100/bar:baz',
          imageRemoveTaskQueued: false
        })
      })
  })

  it('should enqueue a job to remove the container if no context version was found', function () {
    MongoDB.prototype.countContextVersions.yields(null, 0)
    return assert.isFulfilled(checkImageAgainstContextVersions(testJob))
      .then(function (result) {
        sinon.assert.calledOnce(Hermes.prototype.publish)
        sinon.assert.calledWithExactly(
          Hermes.prototype.publish,
          'khronos:images:remove',
          testJob
        )
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          imageId: process.env.KHRONOS_DOCKER_REGISTRY + '/100/bar:baz',
          imageRemoveTaskQueued: true
        })
      })
  })
})
