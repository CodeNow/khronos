'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
var Bunyan = require('bunyan')
var Promise = require('bluebird')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var Docker = require('models/docker')
var Mavis = require('models/mavis')

// internal (being tested)
var deleteContainer = require('tasks/containers/delete')

describe('Delete Container Task', function () {
  var testJob = {
    dockerHost: 'http://example.com',
    containerId: 4
  }

  beforeEach(function () {
    sinon.stub(Bunyan.prototype, 'error').returns()
    sinon.stub(Docker.prototype, 'removeStoppedContainer').yieldsAsync()
    sinon.stub(Mavis.prototype, 'verifyHost').returns(Promise.resolve(true))
  })
  afterEach(function () {
    Bunyan.prototype.error.restore()
    Docker.prototype.removeStoppedContainer.restore()
    Mavis.prototype.verifyHost.restore()
  })

  describe('errors', function () {
    it('should throw an error on missing dockerHost', function () {
      return assert.isRejected(
        deleteContainer({ dockerHost: 'http://example.com' }),
        TaskFatalError,
        /containerId.+required/
      )
    })
    it('should throw an error on missing containerId', function () {
      return assert.isRejected(
        deleteContainer({ containerId: 'deadbeef' }),
        TaskFatalError,
        /dockerHost.+required/
      )
    })

    describe('Docker Error', function () {
      beforeEach(function () {
        Docker.prototype.removeStoppedContainer.yieldsAsync(new Error('foobar'))
      })

      it('should thrown the error', function () {
        return assert.isRejected(
          deleteContainer(testJob),
          Error,
          'foobar'
        )
      })
    })

    describe('Mavis Error', function () {
      beforeEach(function () {
        Mavis.prototype.verifyHost.throws(new Mavis.InvalidHostError())
      })

      it('should return an empty data if dock not in mavis', function () {
        return assert.isFulfilled(deleteContainer(testJob))
          .then(function (data) {
            sinon.assert.calledOnce(Mavis.prototype.verifyHost)
            sinon.assert.calledWithExactly(Mavis.prototype.verifyHost, testJob.dockerHost)
            assert.deepEqual(data, {
              dockerHost: testJob.dockerHost,
              removedContainer: ''
            })
            sinon.assert.notCalled(Docker.prototype.removeStoppedContainer)
          })
      })
    })
  })

  describe('missing container', function () {
    var error
    beforeEach(function () {
      error = new Error('foobar')
      error.statusCode = 404
      Docker.prototype.removeStoppedContainer.yieldsAsync(error)
    })

    it('should simply conclude', function () {
      return assert.isFulfilled(deleteContainer(testJob))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.removeStoppedContainer)
          sinon.assert.calledWithExactly(
            Docker.prototype.removeStoppedContainer,
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
    return assert.isFulfilled(deleteContainer(testJob))
      .then(function (result) {
        sinon.assert.calledOnce(Docker.prototype.removeStoppedContainer)
        sinon.assert.calledWithExactly(
          Docker.prototype.removeStoppedContainer,
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
