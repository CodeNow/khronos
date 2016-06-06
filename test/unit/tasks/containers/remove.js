'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
const Bunyan = require('bunyan')
const chai = require('chai')
const sinon = require('sinon')
const TaskFatalError = require('ponos').TaskFatalError

// internal
const Docker = require('models/docker')
const Swarm = require('models/swarm')

// internal (being tested)
const removeContainer = require('tasks/containers/remove')

const assert = chai.assert
chai.use(require('chai-as-promised'))
require('sinon-as-promised')(require('bluebird'))

describe('Remove Container Task', function () {
  var testJob = {
    dockerHost: 'http://example.com',
    containerId: 4
  }

  beforeEach(function () {
    sinon.stub(Bunyan.prototype, 'error').returns()
    sinon.stub(Bunyan.prototype, 'warn').returns()
    sinon.stub(Swarm.prototype, 'checkHostExists').resolves(true)
    sinon.stub(Docker.prototype, 'removeContainer').resolves()
  })
  afterEach(function () {
    Bunyan.prototype.error.restore()
    Bunyan.prototype.warn.restore()
    Swarm.prototype.checkHostExists.restore()
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
        Docker.prototype.removeContainer.rejects(new Error('foobar'))
        return assert.isRejected(
          removeContainer(testJob),
          Error,
          'foobar'
        )
      })
    })

    describe('Mavis Error', function () {
      beforeEach(function () {
        Swarm.prototype.checkHostExists.throws(new Swarm.InvalidHostError())
      })

      it('should return an empty data if dock not in mavis', function () {
        return assert.isFulfilled(removeContainer(testJob))
          .then(function (data) {
            sinon.assert.calledOnce(Swarm.prototype.checkHostExists)
            sinon.assert.calledWithExactly(Swarm.prototype.checkHostExists, testJob.dockerHost)
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
    var error
    beforeEach(function () {
      error = new Error('foobar')
      error.statusCode = 404
      Docker.prototype.removeContainer.rejects(error)
    })

    it('should simply conclude', function () {
      return assert.isFulfilled(removeContainer(testJob))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.removeContainer)
          sinon.assert.calledWithExactly(
            Docker.prototype.removeContainer,
            4
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
          4
        )
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          removedContainer: 4
        })
      })
  })
})
