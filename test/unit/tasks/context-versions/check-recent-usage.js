'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert

// external
var ObjectID = require('mongodb').ObjectID
var rabbitmq = require('runnable-hermes')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var MongoDB = require('models/mongodb')

// internal (being tested)
var contextVersionsCheckRecentUsage = require('tasks/context-versions/check-recent-usage')

describe('context versions check recent usage task', function () {
  var sampleJob
  beforeEach(function (done) {
    sinon.stub(MongoDB.prototype, 'close').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'connect').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'countBuilds').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'countInstances').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'close').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'connect').yieldsAsync()
    sinon.stub(rabbitmq.prototype, 'publish').returns()
    var targetDate = new Date()
    targetDate.setDate(targetDate.getDate() - 5)
    sampleJob = {
      contextVersionId: 'deadbeefdeadbeefdeadbeef',
      twoWeeksAgo: targetDate
    }
    done()
  })
  afterEach(function (done) {
    MongoDB.prototype.close.restore()
    MongoDB.prototype.connect.restore()
    MongoDB.prototype.countBuilds.restore()
    MongoDB.prototype.countInstances.restore()
    rabbitmq.prototype.close.restore()
    rabbitmq.prototype.connect.restore()
    rabbitmq.prototype.publish.restore()
    done()
  })

  describe('errors', function () {
    describe('Validation Errors', function () {
      it('should throw an error on missing contextVersionId', function (done) {
        delete sampleJob.contextVersionId
        contextVersionsCheckRecentUsage(sampleJob)
          .then(function () {
            throw new Error('task should have thrown an error')
          })
          .catch(function (err) {
            assert.instanceOf(err, TaskFatalError, 'task fatally errors')
            assert.match(err.message, /contextVersionId.+required/, 'task errors')
            done()
          })
          .catch(done)
      })
      it('should throw an error on missing twoWeeksAgo', function (done) {
        delete sampleJob.twoWeeksAgo
        contextVersionsCheckRecentUsage(sampleJob)
          .then(function () {
            throw new Error('task should have thrown an error')
          })
          .catch(function (err) {
            assert.instanceOf(err, TaskFatalError, 'task fatally errors')
            assert.match(err.message, /twoWeeksAgo.+required/, 'task errors')
            done()
          })
          .catch(done)
      })
    })

    describe('if rabbitmq throws an error', function () {
      it('should throw the error', function (done) {
        MongoDB.prototype.countBuilds.yieldsAsync(null, 0)
        MongoDB.prototype.countInstances.yieldsAsync(null, 0)
        rabbitmq.prototype.connect.yieldsAsync(new Error('foobar'))
        contextVersionsCheckRecentUsage(sampleJob)
          .then(function () {
            throw new Error('task should have thrown an error')
          })
          .catch(function (err) {
            assert.instanceOf(err, Error, 'normal error')
            assert.equal(err.message, 'foobar')
            done()
          })
          .catch(done)
      })
    })

    describe('if mongodb errors', function () {
      it('should throw the error', function (done) {
        MongoDB.prototype.countBuilds.yieldsAsync(new Error('foobar'))
        contextVersionsCheckRecentUsage(sampleJob)
          .then(function () {
            throw new Error('task should have thrown an error')
          })
          .catch(function (err) {
            assert.instanceOf(err, Error, 'normal error')
            assert.equal(err.message, 'foobar')
            done()
          })
          .catch(done)
      })
    })
  })

  describe('queries to mongo', function () {
    it('should query for the count of builds', function (done) {
      MongoDB.prototype.countBuilds.yieldsAsync(null, 42)
      MongoDB.prototype.countInstances.yieldsAsync(null, 0)
      contextVersionsCheckRecentUsage(sampleJob)
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
          done()
        })
        .catch(done)
    })
    it('should query for the count of instance', function (done) {
      MongoDB.prototype.countBuilds.yieldsAsync(null, 0)
      MongoDB.prototype.countInstances.yieldsAsync(null, 42)
      contextVersionsCheckRecentUsage(sampleJob)
        .then(function () {
          sinon.assert.calledOnce(MongoDB.prototype.countInstances)
          sinon.assert.calledWith(
            MongoDB.prototype.countInstances,
            {
              'contextVersion._id': new ObjectID('deadbeefdeadbeefdeadbeef')
            },
            sinon.match.func
          )
          done()
        })
        .catch(done)
    })
  })

  describe('when it is still attached to a build', function () {
    it('should not enqueue a new task', function (done) {
      MongoDB.prototype.countBuilds.yieldsAsync(null, 1)
      MongoDB.prototype.countInstances.yieldsAsync(null, 0)
      contextVersionsCheckRecentUsage(sampleJob)
        .then(function () {
          sinon.assert.notCalled(rabbitmq.prototype.publish)
          done()
        })
        .catch(done)
    })
  })

  describe('when it is still attached to an instance', function () {
    it('should not enqueue a new task', function (done) {
      MongoDB.prototype.countBuilds.yieldsAsync(null, 0)
      MongoDB.prototype.countInstances.yieldsAsync(null, 1)
      contextVersionsCheckRecentUsage(sampleJob)
        .then(function () {
          sinon.assert.notCalled(rabbitmq.prototype.publish)
          done()
        })
        .catch(done)
    })
  })

  describe('when it is not attached to anything', function () {
    it('should enqueue a new task', function (done) {
      MongoDB.prototype.countBuilds.yieldsAsync(null, 0)
      MongoDB.prototype.countInstances.yieldsAsync(null, 0)
      contextVersionsCheckRecentUsage(sampleJob)
        .then(function () {
          sinon.assert.calledOnce(rabbitmq.prototype.publish)
          sinon.assert.calledWithExactly(
            rabbitmq.prototype.publish,
            'khronos:context-versions:remove-and-protect-instances',
            { contextVersionId: 'deadbeefdeadbeefdeadbeef' }
          )
          done()
        })
        .catch(done)
    })
  })
})
