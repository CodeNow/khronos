'use strict'

require('loadenv')({ debugName: 'khronos:test' })

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
var rabbitmq = require('runnable-hermes')
var sinon = require('sinon')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal (being tested)
var ContextVersionDeleted = require('tasks/context-versions/deleted')

describe('context-version.deleted', function () {
  var sampleJob
  var dockerHost = 'http://10.4.152.175:4242'
  var containerId = '33e49e982facb15fb4d26e117894de59a65a4a6100463934f3f9da1022cac130'
  beforeEach(function () {
    sinon.stub(rabbitmq.prototype, 'close').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'connect').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'publish').returns()
    var targetDate = new Date()
    targetDate.setDate(targetDate.getDate() - 5)
    sampleJob = {
      contextVersion: {
        _id: '123',
        someOtherProperty: true,
        build: {
          dockerContainer: containerId,
          _id: '123',
          someOtherPropertyAgain: 1
        },
        dockerHost: dockerHost
      }
    }
  })
  afterEach(function () {
    rabbitmq.prototype.close.restore()
    rabbitmq.prototype.connect.restore()
    rabbitmq.prototype.publish.restore()
  })

  describe('errors', function () {
    describe('Validation Errors', function () {
      it('should throw an error if something other than a context verison is passed', function () {
        sampleJob.something = true
        return assert.isRejected(
          ContextVersionDeleted(sampleJob),
          WorkerStopError,
          /something.+not.+allowed/
        )
      })

      it('should throw an error on missing dockerContainer', function () {
        delete sampleJob.contextVersion.build.dockerContainer
        return assert.isRejected(
          ContextVersionDeleted(sampleJob),
          WorkerStopError,
          /contextVersionId.+required/
        )
      })

      it('should throw an error on missing dockerHost', function () {
        delete sampleJob.contextVersion.dockerHost
        return assert.isRejected(
          ContextVersionDeleted(sampleJob),
          WorkerStopError,
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
          ContextVersionDeleted(sampleJob),
          Error,
          'foobar'
        )
      })
    })
  })

  describe('when it is not attached to anything', function () {
    it('should enqueue a new task', function (done) {
      return assert.isFulfilled(ContextVersionDeleted(sampleJob))
        .then(function () {
          sinon.assert.calledOnce(rabbitmq.prototype.publish)
          sinon.assert.calledWithExactly(
            rabbitmq.prototype.publish,
            'khronos:containers:remove',
            {
              containerId: containerId,
              dockerHost: dockerHost
            }
          )
        })
        .asCallback(done)
    })
  })
})
