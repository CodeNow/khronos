'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
var Bunyan = require('bunyan')
var Promise = require('bluebird')
var rabbitmq = require('runnable-hermes')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var Docker = require('models/docker')
var Mavis = require('models/mavis')

// internal (being tested)
var enqueueContainerVerificationTask =
  require('tasks/containers/prune-orphans-dock')

describe('Prune Orphans Dock Task', function () {
  beforeEach(function () {
    sinon.stub(Bunyan.prototype, 'error').returns()
    sinon.stub(Docker.prototype, 'getContainers').yieldsAsync(null, [])
    sinon.stub(Mavis.prototype, 'verifyHost').returns(Promise.resolve(true))
    sinon.stub(rabbitmq.prototype, 'close').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'connect').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'publish').returns()
  })
  afterEach(function () {
    Bunyan.prototype.error.restore()
    Docker.prototype.getContainers.restore()
    Mavis.prototype.verifyHost.restore()
    rabbitmq.prototype.connect.restore()
    rabbitmq.prototype.publish.restore()
    rabbitmq.prototype.close.restore()
  })

  describe('errors', function () {
    describe('invalid arguments', function () {
      it('throws an error when missing dockerHost', function () {
        return assert.isRejected(
          enqueueContainerVerificationTask({}),
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
          enqueueContainerVerificationTask({ dockerHost: 'http://example.com' }),
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
          enqueueContainerVerificationTask({ dockerHost: 'http://example.com' }),
          Error,
          'foobar'
        )
      })
    })
  })

  describe('with a no containers on a host', function () {
    it('should not enqueue any task', function () {
      var job = { dockerHost: 'http://example.com' }
      return assert.isFulfilled(enqueueContainerVerificationTask(job))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.getContainers)
          sinon.assert.calledWithExactly(
            Docker.prototype.getContainers,
            {
              filters: '{"status":["exited"]}'
            },
            sinon.match.array,
            sinon.match.func
          )
          sinon.assert.notCalled(rabbitmq.prototype.publish)
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
      var job = { dockerHost: 'http://example.com' }
      return assert.isFulfilled(enqueueContainerVerificationTask(job))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.getContainers)
          sinon.assert.calledWithExactly(
            Docker.prototype.getContainers,
            {
              filters: '{"status":["exited"]}'
            },
            sinon.match.array,
            sinon.match.func
          )
          sinon.assert.calledOnce(rabbitmq.prototype.publish)
          sinon.assert.calledWithExactly(
            rabbitmq.prototype.publish,
            'khronos:containers:orphan:check-against-mongo',
            {
              dockerHost: 'http://example.com',
              containerId: 4
            }
          )
          assert.equal(result, 1, 'result is 1')
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
      var job = { dockerHost: 'http://example.com' }
      return assert.isFulfilled(enqueueContainerVerificationTask(job))
        .then(function (result) {
          sinon.assert.calledOnce(Docker.prototype.getContainers)
          sinon.assert.calledWithExactly(
            Docker.prototype.getContainers,
            {
              filters: '{"status":["exited"]}'
            },
            sinon.match.array,
            sinon.match.func
          )
          sinon.assert.calledTwice(rabbitmq.prototype.publish)
          sinon.assert.calledWithExactly(
            rabbitmq.prototype.publish,
            'khronos:containers:orphan:check-against-mongo',
            {
              dockerHost: 'http://example.com',
              containerId: 4
            }
          )
          sinon.assert.calledWithExactly(
            rabbitmq.prototype.publish,
            'khronos:containers:orphan:check-against-mongo',
            {
              dockerHost: 'http://example.com',
              containerId: 5
            }
          )
          assert.equal(result, 2, 'result is 2')
        })
    })
  })
})
