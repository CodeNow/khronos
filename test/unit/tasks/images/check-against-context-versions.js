'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert

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

  beforeEach(function (done) {
    sinon.stub(Hermes.prototype, 'close').yieldsAsync()
    sinon.stub(Hermes.prototype, 'connect').yieldsAsync()
    sinon.stub(Hermes.prototype, 'publish').returns()
    sinon.stub(MongoDB.prototype, 'close').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'connect').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'countContextVersions').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'newObjectID').returnsArg(0)
    done()
  })
  afterEach(function (done) {
    Hermes.prototype.close.restore()
    Hermes.prototype.connect.restore()
    Hermes.prototype.publish.restore()
    MongoDB.prototype.close.restore()
    MongoDB.prototype.connect.restore()
    MongoDB.prototype.countContextVersions.restore()
    MongoDB.prototype.newObjectID.restore()
    done()
  })

  describe('Parameter Errors', function () {
    it('should throw an error on missing dockerHost', function (done) {
      checkImageAgainstContextVersions({ dockerHost: 'http://example.com' })
        .then(function () {
          throw new Error('task should have thrown an error')
        })
        .catch(TaskFatalError, function (err) {
          assert.match(err.message, /imageId.+required/, 'task errors')
          done()
        })
        .catch(done)
    })
    it('should throw an error on missing imageId', function (done) {
      checkImageAgainstContextVersions({ imageId: 'deadbeef' })
        .then(function () {
          throw new Error('task should have thrown an error')
        })
        .catch(TaskFatalError, function (err) {
          assert.match(err.message, /dockerHost.+required/, 'task errors')
          done()
        })
        .catch(done)
    })
  })

  describe('MongoDB Error', function () {
    it('should throw the error', function (done) {
      MongoDB.prototype.countContextVersions.yieldsAsync(new Error('foobar'))
      checkImageAgainstContextVersions(testJob)
        .then(function () {
          throw new Error('task should have thrown an error')
        })
        .catch(Error, function (err) {
          assert.equal(err.message, 'foobar')
          sinon.assert.notCalled(Hermes.prototype.publish)
          done()
        })
        .catch(done)
    })
  })

  describe('Rabbitmq Error', function () {
    it('should thrown the error', function (done) {
      MongoDB.prototype.countContextVersions.yields(null, 0)
      Hermes.prototype.connect.yieldsAsync(new Error('foobar'))
      checkImageAgainstContextVersions(testJob)
        .then(function () {
          throw new Error('task should have thrown an error')
        })
        .catch(function (err) {
          assert.instanceOf(err, Error, 'normal error')
          assert.equal(err.message, 'foobar')
          sinon.assert.notCalled(Hermes.prototype.publish)
          done()
        })
        .catch(done)
    })
  })

  it('should fetch context versions for the exact id', function (done) {
    MongoDB.prototype.countContextVersions.yields(null, 1)
    checkImageAgainstContextVersions(testJob)
      .then(function (result) {
        sinon.assert.calledWithExactly(
          MongoDB.prototype.countContextVersions,
          {
            _id: 'baz'
          },
          sinon.match.func
        )
        done()
      })
      .catch(done)
  })

  it('should not remove the container if the context version is in mongo', function (done) {
    MongoDB.prototype.countContextVersions.yields(null, 1)
    checkImageAgainstContextVersions(testJob)
      .then(function (result) {
        sinon.assert.notCalled(Hermes.prototype.publish)
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          imageId: process.env.KHRONOS_DOCKER_REGISTRY + '/100/bar:baz',
          imageRemoveTaskQueued: false
        })
        done()
      })
      .catch(done)
  })

  it('should enqueue a job to remove the container if no context version was found', function (done) {
    MongoDB.prototype.countContextVersions.yields(null, 0)
    checkImageAgainstContextVersions(testJob)
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
        done()
      })
      .catch(done)
  })
})
