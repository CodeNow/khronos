'use strict'

require('loadenv')({ debugName: 'khronos:test' })

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
var Promise = require('bluebird')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var Docker = require('models/docker')
var Mavis = require('models/mavis')

// internal (being tested)
var removeImage = require('tasks/images/remove')

describe('Remove Image Task', function () {
  var testJob = {
    dockerHost: 'http://example.com',
    imageId: 4
  }

  beforeEach(function () {
    sinon.stub(Docker.prototype, 'removeImage').yieldsAsync()
    sinon.stub(Mavis.prototype, 'verifyHost').returns(Promise.resolve(true))
  })
  afterEach(function () {
    Docker.prototype.removeImage.restore()
    Mavis.prototype.verifyHost.restore()
  })

  describe('errors', function () {
    it('should throw an error on missing imageId', function () {
      return assert.isRejected(
        removeImage({ dockerHost: 'http://example.com' }),
        TaskFatalError,
        /imageId.+required/
      )
    })
    it('should throw an error on missing dockerHost', function () {
      return assert.isRejected(
        removeImage({ imageId: 'deadbeef' }),
        TaskFatalError,
        /dockerHost.+required/
      )
    })

    describe('Mavis Error', function () {
      beforeEach(function () {
        Mavis.prototype.verifyHost.throws(new Mavis.InvalidHostError())
      })

      it('should return an empty data if dock not in mavis', function () {
        return assert.isFulfilled(removeImage(testJob))
          .then(function (result) {
            sinon.assert.calledOnce(Mavis.prototype.verifyHost)
            sinon.assert.calledWithExactly(Mavis.prototype.verifyHost, testJob.dockerHost)
            assert.deepEqual(
              result,
              {
                dockerHost: testJob.dockerHost,
                removedImage: ''
              })
            sinon.assert.notCalled(Docker.prototype.removeImage)
          })
      })
    })

    describe('Docker Errors', function () {
      it('should thrown the error', function () {
        Docker.prototype.removeImage.yieldsAsync(new Error('foobar'))
        return assert.isRejected(
          removeImage(testJob),
          Error,
          'foobar'
        )
      })

      it('should throw TaskFatalError if image is in use', function () {
        var error = new Error('foobar')
        error.statusCode = 409
        Docker.prototype.removeImage.yieldsAsync(error)
        return assert.isRejected(
          removeImage(testJob),
          TaskFatalError,
          /409 conflict/i
        )
      })

      it('should throw TaskFatalError if image not found', function () {
        var error = new Error('foobar')
        error.statusCode = 404
        Docker.prototype.removeImage.yieldsAsync(error)
        return assert.isRejected(
          removeImage(testJob),
          TaskFatalError,
          /404 not found/i
        )
      })
    })
  })

  it('should remove a image', function () {
    return assert.isFulfilled(removeImage(testJob))
      .then(function (result) {
        sinon.assert.calledOnce(Docker.prototype.removeImage)
        sinon.assert.calledWithExactly(
          Docker.prototype.removeImage,
          4,
          sinon.match.func
        )
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          removedImage: 4
        })
      })
  })
})
