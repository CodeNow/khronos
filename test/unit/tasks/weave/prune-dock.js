'use strict'

require('loadenv')({ debugName: 'khronos:test' })

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
var Bunyan = require('bunyan')
var rabbitmq = require('runnable-hermes')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var Docker = require('models/docker')
var Mavis = require('models/mavis')

// internal (being tested)
var weavePruneDock = require('tasks/weave/prune-dock')

describe('Delete Weave Container Dock Task', function () {
  beforeEach(function () {
    sinon.stub(Bunyan.prototype, 'error').returns()
    sinon.stub(Docker.prototype, 'getContainers').yieldsAsync(null, [])
    sinon.stub(Mavis.prototype, 'verifyHost').returns(true)
    sinon.stub(rabbitmq.prototype, 'close').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'connect').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'publish').returns()
  })
  afterEach(function () {
    Bunyan.prototype.error.restore()
    Docker.prototype.getContainers.restore()
    Mavis.prototype.verifyHost.restore()
    rabbitmq.prototype.close.restore()
    rabbitmq.prototype.connect.restore()
    rabbitmq.prototype.publish.restore()
  })

  describe('errors', function () {
    describe('invalid arguments', function () {
      it('throws an error when missing dockerHost', function () {
        return assert.isRejected(
          weavePruneDock({}),
          TaskFatalError,
          /dockerHost.+required/
        )
      })
    })

    describe('if rabbitmq throws an error', function () {
      beforeEach(function () {
        rabbitmq.prototype.connect.yieldsAsync(new Error('foobar'))
      })

      it('should throw the error', function () {
        return assert.isRejected(
          weavePruneDock({ dockerHost: 'http://example.com' }),
          Error,
          'foobar'
        )
      })
    })

    describe('if docker throws an error', function () {
      beforeEach(function () {
        Docker.prototype.getContainers.yieldsAsync(new Error('foobar'))
      })

      it('should throw the error', function () {
        return assert.isRejected(
          weavePruneDock({ dockerHost: 'http://example.com' }),
          Error,
          'foobar'
        )
      })
    })
  })

  describe('with a no containers on a host', function () {
    it('should not enqueue any task', function () {
      return assert.isFulfilled(weavePruneDock({ dockerHost: 'http://example.com' }))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.getContainers)
          sinon.assert.calledWithExactly(
            Docker.prototype.getContainers,
            { filters: '{"status":["exited"]}' },
            sinon.match.array,
            sinon.match.func
          )
          assert.equal(result, 0, 'result is 0')
        })
    })
  })

  describe('with a single container on a host', function () {
    beforeEach(function () {
      var containers = [{
        Id: 4
      }]
      Docker.prototype.getContainers.yieldsAsync(null, containers)
    })

    it('should enqueue a job to remove the container', function () {
      return assert.isFulfilled(weavePruneDock({ dockerHost: 'http://example.com' }))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.getContainers)
          sinon.assert.calledWithExactly(
            Docker.prototype.getContainers,
            { filters: '{"status":["exited"]}' },
            sinon.match.array,
            sinon.match.func
          )
          sinon.assert.calledOnce(rabbitmq.prototype.publish)
          assert.equal(result, 1, 'result is 0')
        })
    })
  })

  describe('with multiple containers on a host', function () {
    beforeEach(function () {
      var containers = [{
        Id: 4
      }, {
        Id: 5
      }]
      Docker.prototype.getContainers.yieldsAsync(null, containers)
    })

    it('should remove all the containers', function () {
      return assert.isFulfilled(weavePruneDock({ dockerHost: 'http://example.com' }))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.getContainers)
          sinon.assert.calledWithExactly(
            Docker.prototype.getContainers,
            { filters: '{"status":["exited"]}' },
            sinon.match.array,
            sinon.match.func
          )
          sinon.assert.calledTwice(rabbitmq.prototype.publish)
          assert.equal(result, 2, 'result is 0')
        })
    })
  })
})
