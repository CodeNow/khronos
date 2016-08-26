'use strict'

require('loadenv')({ debugName: 'khronos:test' })

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
var rabbitmq = require('models/rabbitmq')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

// Internal
const MongoDB = require('models/mongodb')

// internal (being tested)
var CleanupInstances = require('tasks/instances/cleanup')

describe('khronos:instances:cleanup', function () {
  var mockInstances

  beforeEach(function () {
    mockInstances = [
      {
        _id: '1234'
      },
      {
        _id: '5678'
      }
    ]
    sinon.stub(MongoDB.prototype, 'close').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'connect').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'fetchInstances').yieldsAsync(null, mockInstances)
    sinon.stub(rabbitmq, 'publishTask').resolves()
  })

  afterEach(function () {
    MongoDB.prototype.close.restore()
    MongoDB.prototype.connect.restore()
    MongoDB.prototype.fetchInstances.restore()
    rabbitmq.publishTask.restore()
  })

  describe('when there are instances to cleanup', function () {
    it('should fetch instances with the propery query parameters', function (done) {
      return assert.isFulfilled(CleanupInstances({}))
        .then(function () {
          sinon.assert.calledOnce(MongoDB.prototype.fetchInstances)
          sinon.assert.calledWith(
            MongoDB.prototype.fetchInstances,
            {
              masterPod: false,
              'contextVersion.created': { $lt: sinon.match.date },
              $or: [
                { isolated: { $exists: false } },
                { isIsolationGroupMaster: true }
              ]
            }
          )
        })
        .asCallback(done)
    })

    it('should cleanup the old instances', function (done) {
      return assert.isFulfilled(CleanupInstances({}))
        .then(function () {
          sinon.assert.calledTwice(rabbitmq.publishTask)
          sinon.assert.calledWith(
            rabbitmq.publishTask,
            'instance.delete',
            {
              instanceId: '1234'
            }
          )
          sinon.assert.calledWith(
            rabbitmq.publishTask,
            'instance.delete',
            {
              instanceId: '5678'
            }
          )
        })
        .asCallback(done)
    })
  })
})
