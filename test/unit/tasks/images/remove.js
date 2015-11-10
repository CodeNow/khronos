'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert

// external
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var Docker = require('models/docker')

// internal (being tested)
var removeImage = require('tasks/images/remove')

describe('Remove Image Task', function () {
  var testJob = {
    dockerHost: 'http://example.com',
    imageId: 4
  }

  beforeEach(function (done) {
    sinon.stub(Docker.prototype, 'removeImage').yieldsAsync()
    done()
  })
  afterEach(function (done) {
    Docker.prototype.removeImage.restore()
    done()
  })

  describe('errors', function () {
    it('should throw an error on missing dockerHost', function (done) {
      removeImage({ dockerHost: 'http://example.com' })
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
      removeImage({ imageId: 'deadbeef' })
        .then(function () {
          throw new Error('task should have thrown an error')
        })
        .catch(TaskFatalError, function (err) {
          assert.match(err.message, /dockerHost.+required/, 'task errors')
          done()
        })
        .catch(done)
    })

    describe('Docker Error', function () {
      it('should thrown the error', function (done) {
        Docker.prototype.removeImage
          .yieldsAsync(new Error('foobar'))
        removeImage(testJob)
          .then(function () {
            throw new Error('task should have thrown an error')
          })
          .catch(Error, function (err) {
            assert.equal(err.message, 'foobar')
            done()
          })
          .catch(done)
      })

      it('should throw TaskFatalError if image is in use', function (done) {
        var error = new Error('foobar')
        error.statusCode = 409
        Docker.prototype.removeImage.yieldsAsync(error)
        removeImage(testJob)
          .then(function () {
            throw new Error('task should have thrown an error')
          })
          .catch(TaskFatalError, function (err) {
            assert.match(err.message, /409 conflict/i)
            done()
          })
          .catch(done)
      })

      it('should throw TaskFatalError if image not found', function (done) {
        var error = new Error('foobar')
        error.statusCode = 404
        Docker.prototype.removeImage.yieldsAsync(error)
        removeImage(testJob)
          .then(function () {
            throw new Error('task should have thrown an error')
          })
          .catch(TaskFatalError, function (err) {
            assert.match(err.message, /404 not found/i)
            done()
          })
          .catch(done)
      })
    })
  })

  it('should remove a image', function (done) {
    removeImage(testJob)
      .then(function (result) {
        var removeStub = Docker.prototype.removeImage
        assert.ok(removeStub.calledOnce, 'remove called once')
        var removedId = removeStub.firstCall.args[0]
        assert.equal(removedId, 4, 'removed the correct image')
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          removedImage: 4
        })
        done()
      })
      .catch(done)
  })
})
