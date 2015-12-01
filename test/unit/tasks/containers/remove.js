'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
chai.use(require('chai-as-promised'))
var assert = chai.assert

// external
var Bunyan = require('bunyan')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var Docker = require('models/docker')

// internal (being tested)
var removeContainer = require('tasks/containers/remove')

describe('Remove Container Task', function () {
  var testJob = {
    dockerHost: 'http://example.com',
    containerId: 4
  }

  beforeEach(function () {
    sinon.stub(Bunyan.prototype, 'error').returns()
    sinon.stub(Docker.prototype, 'removeContainer').yieldsAsync()
  })
  afterEach(function () {
    Bunyan.prototype.error.restore()
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
