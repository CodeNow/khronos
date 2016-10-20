'use strict'

require('loadenv')('khronos:test')

const Promise = require('bluebird')
const chai = require('chai')
// const assert = chai.assert
// chai.use(require('chai-as-promised'))

// external
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

// internal
const CanaryBase = require('tasks/canary/canary-base')
const rabbitmq = require('models/rabbitmq')

// internal
const MongoDB = require('models/mongodb')
// internal (being tested)
const networkCanary = require('tasks/canary/network/index')

describe('Network Canary', () => {
  const mock = {
    job: {}
  }

  beforeEach(() => {
    sinon.stub(MongoDB.prototype, 'close').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'connect').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'instancesAggregate').resolves([])
    sinon.stub(CanaryBase.prototype, 'handleCanaryError')
    sinon.stub(CanaryBase.prototype, 'handleGenericError')
    sinon.stub(CanaryBase.prototype, 'handleSuccess')
    sinon.stub(rabbitmq, 'publishTask').resolves()
  })

  afterEach(() => {
    MongoDB.prototype.close.restore()
    MongoDB.prototype.connect.restore()
    MongoDB.prototype.instancesAggregate.restore()
    CanaryBase.prototype.handleCanaryError.restore()
    CanaryBase.prototype.handleGenericError.restore()
    CanaryBase.prototype.handleSuccess.restore()
    rabbitmq.publishTask.restore()
  })

  describe('on success', () => {
    it('should call instancesAggregate', () => {
      networkCanary(mock.job).then(() => {
        sinon.assert.calledOnce(MongoDB.prototype.instancesAggregate)
        // sinon.assert.calledWith(MongoDB.prototype.instancesAggregate, sinon.match.array)
      })
    })
  })
})
