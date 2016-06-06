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
const deleteContainer = require('tasks/containers/delete')

const assert = chai.assert
chai.use(require('chai-as-promised'))
require('sinon-as-promised')(require('bluebird'))

describe('Delete Container Task', function () {
  var testJob = {
    dockerHost: 'http://example.com',
    containerId: 4
  }

  beforeEach(function () {
    sinon.stub(Bunyan.prototype, 'error').returns()
    sinon.stub(Docker.prototype, 'removeStoppedContainer').resolves()
    sinon.stub(Swarm.prototype, 'checkHostExists').resolves(true)
  })
  afterEach(function () {
    Bunyan.prototype.error.restore()
    Docker.prototype.removeStoppedContainer.restore()
    Swarm.prototype.checkHostExists.restore()
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
        Docker.prototype.removeStoppedContainer.rejects(new Error('foobar'))
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
        Swarm.prototype.checkHostExists.throws(new Swarm.InvalidHostError())
      })

      it('should return an empty data if dock not in mavis', function () {
        return assert.isFulfilled(deleteContainer(testJob))
          .then(function (data) {
            sinon.assert.calledOnce(Swarm.prototype.checkHostExists)
            sinon.assert.calledWithExactly(Swarm.prototype.checkHostExists, testJob.dockerHost)
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
      Docker.prototype.removeStoppedContainer.rejects(error)
    })

    it('should simply conclude', function () {
      return assert.isFulfilled(deleteContainer(testJob))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.removeStoppedContainer)
          sinon.assert.calledWithExactly(
            Docker.prototype.removeStoppedContainer,
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
    return assert.isFulfilled(deleteContainer(testJob))
      .then(function (result) {
        sinon.assert.calledOnce(Docker.prototype.removeStoppedContainer)
        sinon.assert.calledWithExactly(
          Docker.prototype.removeStoppedContainer,
          4
        )
        assert.deepEqual(result, {
          dockerHost: 'http://example.com',
          removedContainer: 4
        })
      })
  })
})
