'use strict'

require('loadenv')({ debugName: 'khronos:test' })

const chai = require('chai')
const assert = chai.assert
chai.use(require('chai-as-promised'))

// external
const ObjectID = require('mongodb').ObjectID
const rabbitmq = require('models/rabbitmq')
const sinon = require('sinon')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

// internal
const MongoDB = require('models/mongodb')

// internal (being tested)
const contextVersionsCheckRecentUsage = require('tasks/context-versions/check-recent-usage')

describe('context versions check recent usage task', function () {
  var sampleJob
  beforeEach(function () {
    sinon.stub(MongoDB.prototype, 'close').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'connect').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'countBuilds').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'countInstances').yieldsAsync()
    sinon.stub(rabbitmq, 'publishTask').resolves()
    var targetDate = new Date()
    targetDate.setDate(targetDate.getDate() - 5)
    sampleJob = {
      contextVersionId: 'deadbeefdeadbeefdeadbeef',
      twoWeeksAgo: targetDate
    }
  })
  afterEach(function () {
    MongoDB.prototype.close.restore()
    MongoDB.prototype.connect.restore()
    MongoDB.prototype.countBuilds.restore()
    MongoDB.prototype.countInstances.restore()
    rabbitmq.publishTask.restore()
  })

  describe('errors', function () {
    describe('Validation Errors', function () {
      it('should throw an error on missing contextVersionId', function () {
        delete sampleJob.contextVersionId
        return assert.isRejected(
          contextVersionsCheckRecentUsage(sampleJob),
          WorkerStopError,
          /contextVersionId.+required/
        )
      })

      it('should throw an error on missing twoWeeksAgo', function () {
        delete sampleJob.twoWeeksAgo
        return assert.isRejected(
          contextVersionsCheckRecentUsage(sampleJob),
          WorkerStopError,
          /twoWeeksAgo.+required/
        )
      })
    })

    describe('if mongodb errors', function () {
      beforeEach(function () {
        MongoDB.prototype.countBuilds.yieldsAsync(new Error('foobar'))
      })

      it('should throw the error', function () {
        return assert.isRejected(
          contextVersionsCheckRecentUsage(sampleJob),
          Error,
          'foobar'
        )
      })
    })
  })

  describe('queries to mongo', function () {
    it('should query for the count of builds', function () {
      MongoDB.prototype.countBuilds.yieldsAsync(null, 42)
      MongoDB.prototype.countInstances.yieldsAsync(null, 0)
      return assert.isFulfilled(contextVersionsCheckRecentUsage(sampleJob))
        .then(function () {
          sinon.assert.calledOnce(MongoDB.prototype.countBuilds)
          sinon.assert.calledWith(
            MongoDB.prototype.countBuilds,
            {
              'build.created': { $gte: sinon.match.date },
              contextVersions: new ObjectID('deadbeefdeadbeefdeadbeef')
            },
            sinon.match.func
          )
          var targetDate = new Date()
          targetDate.setDate(targetDate.getDate() - 5)
          assert.closeTo(
            MongoDB.prototype.countBuilds.firstCall.args[0]['build.created']['$gte'].getTime(),
            targetDate.getTime(),
            500
          )
        })
    })

    it('should query for the count of instance', function () {
      MongoDB.prototype.countBuilds.yieldsAsync(null, 0)
      MongoDB.prototype.countInstances.yieldsAsync(null, 42)
      return assert.isFulfilled(contextVersionsCheckRecentUsage(sampleJob))
        .then(function () {
          sinon.assert.calledOnce(MongoDB.prototype.countInstances)
          sinon.assert.calledWith(
            MongoDB.prototype.countInstances,
            {
              'contextVersion._id': new ObjectID('deadbeefdeadbeefdeadbeef')
            },
            sinon.match.func
          )
        })
    })
  })

  describe('when it is still attached to a build', function () {
    beforeEach(function () {
      MongoDB.prototype.countBuilds.yieldsAsync(null, 1)
      MongoDB.prototype.countInstances.yieldsAsync(null, 0)
    })

    it('should not enqueue a new task', function () {
      return assert.isFulfilled(contextVersionsCheckRecentUsage(sampleJob))
        .then(function () {
          sinon.assert.notCalled(rabbitmq.publishTask)
        })
    })
  })

  describe('when it is still attached to an instance', function () {
    beforeEach(function () {
      MongoDB.prototype.countBuilds.yieldsAsync(null, 0)
      MongoDB.prototype.countInstances.yieldsAsync(null, 1)
    })

    it('should not enqueue a new task', function () {
      return assert.isFulfilled(contextVersionsCheckRecentUsage(sampleJob))
        .then(function () {
          sinon.assert.notCalled(rabbitmq.publishTask)
        })
    })
  })

  describe('when it is not attached to anything', function () {
    beforeEach(function () {
      MongoDB.prototype.countBuilds.yieldsAsync(null, 0)
      MongoDB.prototype.countInstances.yieldsAsync(null, 0)
    })

    it('should enqueue a new task', function () {
      return assert.isFulfilled(contextVersionsCheckRecentUsage(sampleJob))
        .then(function () {
          sinon.assert.calledOnce(rabbitmq.publishTask)
          sinon.assert.calledWithExactly(
            rabbitmq.publishTask,
            'context-versions.remove-and-protect-instances',
            { contextVersionId: 'deadbeefdeadbeefdeadbeef' }
          )
        })
    })
  })
})
