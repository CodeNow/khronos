'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
chai.use(require('chai-as-promised'))
var assert = chai.assert

// external
var Bunyan = require('bunyan')
var Promise = require('bluebird')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var Docker = require('models/docker')
var Mavis = require('models/mavis')

// internal (being tested)
var removeContainer = require('tasks/containers/remove')

describe('Remove Container Task', function () {
  var testJob = {
    dockerHost: 'http://example.com',
    containerId: 4
  }

  beforeEach(function () {
    sinon.stub(Bunyan.prototype, 'error').returns()
    sinon.stub(Bunyan.prototype, 'warn').returns()
    sinon.stub(Mavis.prototype, 'verifyHost').returns(Promise.resolve(true))
    sinon.stub(Docker.prototype, 'removeContainer').yieldsAsync()
  })
  afterEach(function () {
    Bunyan.prototype.error.restore()
    Bunyan.prototype.warn.restore()
    Mavis.prototype.verifyHost.restore()
    Docker.prototype.removeContainer.restore()
  })

  describe('errors', function () {
    it('should throw an error on missing dockerHost', function () {
      return assert.isRejected(
        removeContainer({ dockerHost: 'http://example.com' }),
        TaskFatalError,
        /containerId.+required/
      )
    })
    it('should throw an error on missing containerId', function () {
      return assert.isRejected(
        removeContainer({ containerId: 'deadbeef' }),
        TaskFatalError,
        /dockerHost.+required/
      )
    })

    describe('Docker Error', function () {
      it('should thrown the error', function () {
        Docker.prototype.removeContainer.yieldsAsync(new Error('foobar'))
        return assert.isRejected(
          removeContainer(testJob),
          Error,
          'foobar'
        )
      })
    })

    describe('Mavis Error', function () {
      it('should return an empty data if dock not in mavis', function () {
        Mavis.prototype.verifyHost.throws(new Mavis.InvalidHostError())
        return assert.isFulfilled(removeContainer(testJob))
          .then(function (data) {
            sinon.assert.calledOnce(Mavis.prototype.verifyHost)
            assert.deepEqual(data, {
              dockerHost: testJob.dockerHost,
              removedContainer: ''
            })
            sinon.assert.calledOnce(Bunyan.prototype.warn)
            sinon.assert.notCalled(Docker.prototype.removeContainer)
          })
      })
    })
  })

  describe('missing container', function () {
    it('should simply conclude', function () {
      var error = new Error('foobar')
      error.statusCode = 404
      Docker.prototype.removeContainer.yieldsAsync(error)
      return assert.isFulfilled(removeContainer(testJob))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.removeContainer)
          sinon.assert.calledWithExactly(
            Docker.prototype.removeContainer,
            4,
            sinon.match.func
          )
          assert.deepEqual(result, {
            dockerHost: 'http://example.com',
            removedContainer: ''
          })
        })
    })
  })

  it('should remove a container', function () {
    return assert.isFulfilled(removeContainer(testJob))
      .then(function (result) {
        sinon.assert.calledOnce(Docker.prototype.removeContainer)
        sinon.assert.calledWithExactly(
          Docker.prototype.removeContainer,
          4,
          sinon.match.func
        )
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          removedContainer: 4
        })
      })
  })
})
