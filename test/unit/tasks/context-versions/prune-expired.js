'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
var rabbitmq = require('runnable-hermes')
var sinon = require('sinon')

// internal
var MongoDB = require('models/mongodb')

// internal (being tested)
var contextVersionsPruneExpired = require('tasks/context-versions/prune-expired')

describe('context versions prune expired task', function () {
  beforeEach(function () {
    sinon.stub(MongoDB.prototype, 'close').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'connect').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'fetchContextVersions').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'close').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'connect').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'publish').returns()
  })
  afterEach(function () {
    MongoDB.prototype.close.restore()
    MongoDB.prototype.connect.restore()
    MongoDB.prototype.fetchContextVersions.restore()
    rabbitmq.prototype.close.restore()
    rabbitmq.prototype.connect.restore()
    rabbitmq.prototype.publish.restore()
  })

  describe('errors', function () {
    describe('if rabbitmq throws an error', function () {
      beforeEach(function () {
        MongoDB.prototype.fetchContextVersions.yieldsAsync(null, [{}])
        rabbitmq.prototype.connect.yieldsAsync(new Error('foobar'))
      })

      it('should throw the error', function () {
        return assert.isRejected(
          contextVersionsPruneExpired(),
          Error,
          'foobar'
        )
      })
    })

    describe('if mongodb errors', function () {
      beforeEach(function () {
        MongoDB.prototype.fetchContextVersions.yieldsAsync(new Error('foobar'))
      })

      it('should throw the error', function () {
        return assert.isRejected(
          contextVersionsPruneExpired(),
          Error,
          'foobar'
        )
          .then(function () {
            sinon.assert.notCalled(rabbitmq.prototype.publish)
          })
      })
    })
  })

  describe('query to mongo', function () {
    it('should query for the last two weeks', function () {
      MongoDB.prototype.fetchContextVersions.yieldsAsync(null, [])
      return assert.isFulfilled(contextVersionsPruneExpired())
        .then(function () {
          sinon.assert.calledOnce(MongoDB.prototype.fetchContextVersions)
          sinon.assert.calledWith(
            MongoDB.prototype.fetchContextVersions,
            {
              'build.started': { $lte: sinon.match.date },
              'build.completed': { $exists: true },
              'build.dockerTag': { $exists: true }
            },
            sinon.match.func
          )
          var targetDate = new Date()
          targetDate.setDate(targetDate.getDate() - 5)
          assert.closeTo(
            MongoDB.prototype.fetchContextVersions.firstCall.args[0]['build.started']['$lte'].getTime(),
            targetDate.getTime(),
            500
          )
        })
    })
  })

  describe('with none to prune', function () {
    it('should not enqueue any task', function () {
      MongoDB.prototype.fetchContextVersions.yieldsAsync(null, [])
      return assert.isFulfilled(contextVersionsPruneExpired())
        .then(function (result) {
          assert.equal(result.numJobsEnqueued, 0)
          sinon.assert.notCalled(rabbitmq.prototype.publish)
        })
    })
  })

  describe('with a single context version to prune', function () {
    beforeEach(function () {
      var contextVersions = [{
        _id: 'deadbeef'
      }]
      MongoDB.prototype.fetchContextVersions.yieldsAsync(null, contextVersions)
    })

    it('should enqueue a to check the context version usage', function () {
      return assert.isFulfilled(contextVersionsPruneExpired())
        .then(function (result) {
          sinon.assert.calledOnce(rabbitmq.prototype.publish)
          sinon.assert.calledWith(
            rabbitmq.prototype.publish,
            'khronos:context-versions:check-recent-usage',
            {
              contextVersionId: 'deadbeef',
              twoWeeksAgo: sinon.match.number
            }
          )
          var targetDate = new Date()
          targetDate.setDate(targetDate.getDate() - 5)
          assert.closeTo(
            rabbitmq.prototype.publish.firstCall.args[1].twoWeeksAgo,
            targetDate.getTime(),
            500
          )
          assert.equal(result.numJobsEnqueued, 1, 'enqueued one job')
        })
    })
  })

  describe('with multiple context versions to prune', function () {
    beforeEach(function () {
      var contextVersions = [{
        _id: 'deadbeef'
      }, {
        _id: 'beefdead'
      }]
      MongoDB.prototype.fetchContextVersions.yieldsAsync(null, contextVersions)
    })

    it('should remove all the containers', function () {
      var job = { dockerHost: 'http://example.com' }
      return assert.isFulfilled(contextVersionsPruneExpired(job))
        .then(function (result) {
          sinon.assert.calledTwice(rabbitmq.prototype.publish)
          sinon.assert.calledWith(
            rabbitmq.prototype.publish,
            'khronos:context-versions:check-recent-usage',
            {
              contextVersionId: 'deadbeef',
              twoWeeksAgo: sinon.match.number
            }
          )
          sinon.assert.calledWith(
            rabbitmq.prototype.publish,
            'khronos:context-versions:check-recent-usage',
            {
              contextVersionId: 'beefdead',
              twoWeeksAgo: sinon.match.number
            }
          )
          assert.equal(result.numJobsEnqueued, 2, 'enqueued two jobs')
        })
    })
  })
})
