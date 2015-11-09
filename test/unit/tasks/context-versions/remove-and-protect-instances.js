'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert

// external
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var MongoDB = require('models/mongodb')

// internal (being tested)
var contextVersionRemoveAndProtectInstance = require('tasks/context-versions/remove-and-protect-instances')

describe('context versions remove and protect instances', function () {
  var sampleJob
  beforeEach(function (done) {
    sinon.stub(MongoDB.prototype, 'close').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'connect').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'countInstances').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'fetchContextVersions').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'removeContextVersions').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'insertContextVersions').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'newObjectID').returnsArg(0)
    var targetDate = new Date()
    targetDate.setDate(targetDate.getDate() - 5)
    sampleJob = {
      contextVersionId: 'deadbeef'
    }
    done()
  })
  afterEach(function (done) {
    MongoDB.prototype.close.restore()
    MongoDB.prototype.connect.restore()
    MongoDB.prototype.countInstances.restore()
    MongoDB.prototype.fetchContextVersions.restore()
    MongoDB.prototype.removeContextVersions.restore()
    MongoDB.prototype.insertContextVersions.restore()
    MongoDB.prototype.newObjectID.restore()
    done()
  })

  describe('errors', function () {
    describe('Validation Errors', function () {
      it('should throw an error on missing contextVersionId', function (done) {
        delete sampleJob.contextVersionId
        contextVersionRemoveAndProtectInstance(sampleJob)
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
    })

    describe('if mongodb errors', function () {
      it('should throw the error on connect', function (done) {
        MongoDB.prototype.connect.yieldsAsync(new Error('foobar'))
        contextVersionRemoveAndProtectInstance(sampleJob)
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
    it('should throw the error on fetchContextVersions', function (done) {
      MongoDB.prototype.fetchContextVersions.yieldsAsync(new Error('foobar'))
      contextVersionRemoveAndProtectInstance(sampleJob)
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
    it('should fatally error with not found message', function (done) {
      MongoDB.prototype.fetchContextVersions.yieldsAsync(null, [])
      contextVersionRemoveAndProtectInstance(sampleJob)
        .then(function () {
          throw new Error('task should have thrown an error')
        })
        .catch(TaskFatalError, function (err) {
          assert.match(err.message, /could not find context version/i)
          done()
        })
        .catch(done)
    })
  })

  it('should remove a context version', function (done) {
    MongoDB.prototype.fetchContextVersions.yieldsAsync(null, [{
      _id: 'deadbeef'
    }])
    MongoDB.prototype.countInstances.yieldsAsync(null, 0)
    contextVersionRemoveAndProtectInstance(sampleJob)
      .then(function (result) {
        sinon.assert.calledOnce(MongoDB.prototype.removeContextVersions)
        sinon.assert.calledWith(
          MongoDB.prototype.removeContextVersions,
          { _id: 'deadbeef' }
        )
        assert.deepEqual(result, {
          contextVersionId: 'deadbeef',
          removed: true
        })
        done()
      })
      .catch(done)
  })

  describe('when it does remove a context version', function () {
    var contextVersions = [
      { _id: 'deadbeef' }
    ]
    beforeEach(function () {
      MongoDB.prototype.fetchContextVersions.yieldsAsync(null, contextVersions)
      MongoDB.prototype.countInstances.yieldsAsync(null, 0)
    })

    it('should verify that it is not attached to an instance and not re-insert', function (done) {
      contextVersionRemoveAndProtectInstance(sampleJob)
        .then(function (result) {
          sinon.assert.calledOnce(MongoDB.prototype.countInstances)
          sinon.assert.calledWithExactly(
            MongoDB.prototype.countInstances,
            { 'contextVersion._id': 'deadbeef' },
            sinon.match.func
          )
          sinon.assert.notCalled(MongoDB.prototype.insertContextVersions)
          assert.deepEqual(result, {
            contextVersionId: 'deadbeef',
            removed: true
          })
          done()
        })
        .catch(done)
    })

    describe('if it is still attached to an instance', function () {
      it('should restore the context version', function (done) {
        MongoDB.prototype.countInstances.yieldsAsync(null, 1)
        contextVersionRemoveAndProtectInstance(sampleJob)
          .then(function (result) {
            sinon.assert.calledOnce(MongoDB.prototype.insertContextVersions)
            sinon.assert.calledWithExactly(
              MongoDB.prototype.insertContextVersions,
              contextVersions[0],
              sinon.match.func
            )
            assert.deepEqual(result, {
              contextVersionId: 'deadbeef',
              removed: true,
              restored: true
            })
            done()
          })
          .catch(done)
      })
    })
  })
})
