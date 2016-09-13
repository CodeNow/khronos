'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
const Bunyan = require('bunyan')
const chai = require('chai')
const rabbitmq = require('models/rabbitmq')
const sinon = require('sinon')

// internal
const Docker = require('models/docker')
const Swarm = require('models/swarm')

// internal (being tested)
const imageBuilderPruneDock = require('tasks/image-builder/prune-dock')
const MongoDB = require('models/mongodb')

const assert = chai.assert
chai.use(require('chai-as-promised'))
require('sinon-as-promised')(require('bluebird'))

describe('image-builder prune dock task', function () {
  var sampleJob = { dockerHost: 'http://example.com' }
  beforeEach(function () {
    sinon.stub(MongoDB.prototype, 'close').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'connect').yieldsAsync()
    sinon.stub(Bunyan.prototype, 'error').returns()
    sinon.stub(Swarm.prototype, 'checkHostExists').resolves(true)
    sinon.stub(rabbitmq, 'publishTask').resolves()
  })
  afterEach(function () {
    MongoDB.prototype.close.restore()
    MongoDB.prototype.connect.restore()
    Bunyan.prototype.error.restore()
    Swarm.prototype.checkHostExists.restore()
    rabbitmq.publishTask.restore()
  })

  describe('errors', function () {
    describe('if docker throws an error', function () {
      beforeEach(function () {
        sinon.stub(Docker.prototype, 'getContainers').rejects(new Error('foobar'))
      })
      afterEach(function () {
        Docker.prototype.getContainers.restore()
      })

      it('should throw the error', function () {
        return assert.isRejected(
          imageBuilderPruneDock(sampleJob),
          Error,
          'foobar'
        )
      })
    })
  })

  describe('with a no containers on a host', function () {
    beforeEach(function () {
      sinon.stub(Docker.prototype, 'getContainers').resolves([])
      sinon.stub(MongoDB.prototype, 'fetchInstances').yieldsAsync(null, [])
    })
    afterEach(function () {
      MongoDB.prototype.fetchInstances.restore()
      Docker.prototype.getContainers.restore()
    })
    it('should not enqueue any task', function () {
      return assert.isFulfilled(imageBuilderPruneDock(sampleJob))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.getContainers)
          sinon.assert.calledWithExactly(
            Docker.prototype.getContainers,
            {
              filters: '{"status":["exited"]}'
            },
            sinon.match.array,
            []
          )
          sinon.assert.notCalled(rabbitmq.publishTask)
          assert.equal(result, 0, 'result is 0')
        })
    })
  })

  describe('with a single container on a host', function () {
    beforeEach(function () {
      var containers = [{
        Id: 4
      }]
      sinon.stub(Docker.prototype, 'getContainers').resolves(containers)
      sinon.stub(MongoDB.prototype, 'fetchInstances').yieldsAsync(null, [])
    })
    afterEach(function () {
      MongoDB.prototype.fetchInstances.restore()
      Docker.prototype.getContainers.restore()
    })

    it('should enqueue a job to remove the container', function (done) {
      return assert.isFulfilled(imageBuilderPruneDock(sampleJob))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.getContainers)
          sinon.assert.calledWithExactly(
            Docker.prototype.getContainers,
            {
              filters: '{"status":["exited"]}'
            },
            sinon.match.array,
            []
          )
          sinon.assert.calledOnce(rabbitmq.publishTask)
          sinon.assert.calledWithExactly(
            rabbitmq.publishTask,
            'containers.delete',
            {
              dockerHost: 'http://example.com',
              containerId: 4
            }
          )
          assert.equal(result, 1, 'result is 1')
        })
        .asCallback(done)
    })
  })

  describe('with multiple containers on a host', function () {
    describe('when no instances are on that host', function () {
      var containers = [{
        Id: '4'
      }, {
        Id: '5'
      }]
      beforeEach(function () {
        sinon.stub(Docker.prototype, 'getContainers').resolves(containers)
        sinon.stub(MongoDB.prototype, 'fetchInstances').yieldsAsync(null, [])
      })
      afterEach(function () {
        Docker.prototype.getContainers.restore()
        MongoDB.prototype.fetchInstances.restore()
      })
      it('should remove all the containers', function (done) {
        return assert.isFulfilled(imageBuilderPruneDock(sampleJob))
          .then(function (result) {
            sinon.assert.calledOnce(Docker.prototype.getContainers)
            sinon.assert.calledWithExactly(
              Docker.prototype.getContainers,
              {
                filters: '{"status":["exited"]}'
              },
              sinon.match.array,
              []
            )
            sinon.assert.calledTwice(rabbitmq.publishTask)
            sinon.assert.calledWithExactly(
              rabbitmq.publishTask,
              'containers.delete',
              {
                dockerHost: 'http://example.com',
                containerId: '4'
              }
            )
            sinon.assert.calledWithExactly(
              rabbitmq.publishTask,
              'containers.delete',
              {
                dockerHost: 'http://example.com',
                containerId: '5'
              }
            )
            assert.equal(result, 2, 'result is 2')
          })
          .asCallback(done)
      })
    })
    describe('when some instances are on that host', function () {
      var instance = {
        contextVersion: {
          build: {
            dockerContainer: '4'
          }
        }
      }
      var containers = [{
        Id: '5'
      }]
      beforeEach(function () {
        sinon.stub(Docker.prototype, 'getContainers').resolves(containers)
        sinon.stub(MongoDB.prototype, 'fetchInstances').yieldsAsync(null, [instance])
      })
      afterEach(function () {
        MongoDB.prototype.fetchInstances.restore()
        Docker.prototype.getContainers.restore()
      })
      it('should remove all containers but ones connected to instances', function () {
        return assert.isFulfilled(imageBuilderPruneDock(sampleJob))
          .then(function (result) {
            sinon.assert.calledOnce(Docker.prototype.getContainers)
            sinon.assert.calledWithExactly(
              Docker.prototype.getContainers,
              {
                filters: '{"status":["exited"]}'
              },
              [/runnable\/image-builder/],
              ['4']
            )
            sinon.assert.calledOnce(rabbitmq.publishTask)
            sinon.assert.calledWithExactly(
              rabbitmq.publishTask,
              'containers.delete',
              {
                dockerHost: 'http://example.com',
                containerId: '5'
              }
            )
            assert.equal(result, 1, 'result is 1')
          })
      })
    })
  })
})
