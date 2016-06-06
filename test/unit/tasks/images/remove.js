'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
const chai = require('chai')
const Promise = require('bluebird')
const sinon = require('sinon')
const TaskFatalError = require('ponos').TaskFatalError

// internal
const Docker = require('models/docker')
const Swarm = require('models/swarm')

// internal (being tested)
const removeImage = require('tasks/images/remove')

const assert = chai.assert
chai.use(require('chai-as-promised'))
require('sinon-as-promised')(Promise)

describe('Remove Image Task', function () {
  var testJob = {
    dockerHost: 'http://example.com',
    imageId: 4
  }

  beforeEach(function () {
    sinon.stub(Docker.prototype, 'removeImage').resolves()
    sinon.stub(Swarm.prototype, 'checkHostExists').resolves(true)
  })
  afterEach(function () {
    Docker.prototype.removeImage.restore()
    Swarm.prototype.checkHostExists.restore()
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
        Swarm.prototype.checkHostExists.throws(new Swarm.InvalidHostError())
      })

      it('should return an empty data if dock not in mavis', function () {
        return assert.isFulfilled(removeImage(testJob))
          .then(function (result) {
            sinon.assert.calledOnce(Swarm.prototype.checkHostExists)
            sinon.assert.calledWithExactly(Swarm.prototype.checkHostExists, testJob.dockerHost)
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
        Docker.prototype.removeImage.rejects(new Error('foobar'))
        return assert.isRejected(
          removeImage(testJob),
          Error,
          'foobar'
        )
      })

      it('should throw TaskFatalError if image is in use', function () {
        var error = new Error('foobar')
        error.statusCode = 409
        Docker.prototype.removeImage.rejects(error)
        return assert.isRejected(
          removeImage(testJob),
          TaskFatalError,
          /409 conflict/i
        )
      })

      it('should throw TaskFatalError if image not found', function () {
        var error = new Error('foobar')
        error.statusCode = 404
        Docker.prototype.removeImage.rejects(error)
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
          4
        )
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          removedImage: 4
        })
      })
  })
})
