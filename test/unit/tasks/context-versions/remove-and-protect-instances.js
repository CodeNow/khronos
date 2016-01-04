'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal
var MongoDB = require('models/mongodb')

// internal (being tested)
var contextVersionRemoveAndProtectInstance = require('tasks/context-versions/remove-and-protect-instances')

describe('context versions remove and protect instances', function () {
  var sampleJob
  beforeEach(function () {
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
  })
  afterEach(function () {
    MongoDB.prototype.close.restore()
    MongoDB.prototype.connect.restore()
    MongoDB.prototype.countInstances.restore()
    MongoDB.prototype.fetchContextVersions.restore()
    MongoDB.prototype.removeContextVersions.restore()
    MongoDB.prototype.insertContextVersions.restore()
    MongoDB.prototype.newObjectID.restore()
  })

  describe('errors', function () {
    describe('Validation Errors', function () {
      it('should throw an error on missing contextVersionId', function () {
        delete sampleJob.contextVersionId
        return assert.isRejected(
          contextVersionRemoveAndProtectInstance(sampleJob),
          TaskFatalError,
          /contextVersionId.+required/
        )
      })
    })

    describe('if mongodb errors', function () {
      beforeEach(function () {
        MongoDB.prototype.connect.yieldsAsync(new Error('foobar'))
      })

      it('should throw the error on connect', function () {
        return assert.isRejected(
          contextVersionRemoveAndProtectInstance(sampleJob),
          Error,
          'foobar'
        )
      })
    })

    it('should throw the error on fetchContextVersions', function () {
      MongoDB.prototype.fetchContextVersions.yieldsAsync(new Error('foobar'))
      return assert.isRejected(
        contextVersionRemoveAndProtectInstance(sampleJob),
        Error,
        'foobar'
      )
    })

    it('should fatally error with not found message', function () {
      MongoDB.prototype.fetchContextVersions.yieldsAsync(null, [])
      return assert.isRejected(
        contextVersionRemoveAndProtectInstance(sampleJob),
        TaskFatalError,
        /could not find context version/i
      )
    })
  })

  it('should remove a context version', function () {
    MongoDB.prototype.fetchContextVersions.yieldsAsync(null, [{
      _id: 'deadbeef'
    }])
    MongoDB.prototype.countInstances.yieldsAsync(null, 0)
    return assert.isFulfilled(contextVersionRemoveAndProtectInstance(sampleJob))
      .then(function (result) {
        sinon.assert.calledOnce(MongoDB.prototype.removeContextVersions)
        sinon.assert.calledWithExactly(
          MongoDB.prototype.removeContextVersions,
          { _id: 'deadbeef' },
          sinon.match.func
        )
        assert.deepEqual(result, {
          contextVersionId: 'deadbeef',
          removed: true
        })
      })
  })

  describe('when it does remove a context version', function () {
    var contextVersions = [
      { _id: 'deadbeef' }
    ]
    beforeEach(function () {
      MongoDB.prototype.fetchContextVersions.yieldsAsync(null, contextVersions)
      MongoDB.prototype.countInstances.yieldsAsync(null, 0)
    })

    it('should verify that it is not attached to an instance and not re-insert', function () {
      return assert.isFulfilled(contextVersionRemoveAndProtectInstance(sampleJob))
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
        })
    })

    describe('if it is still attached to an instance', function () {
      beforeEach(function () {
        MongoDB.prototype.countInstances.yieldsAsync(null, 1)
      })

      it('should restore the context version', function () {
        return assert.isFulfilled(contextVersionRemoveAndProtectInstance(sampleJob))
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
          })
      })
    })
  })
})
