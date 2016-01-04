'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert
chai.use(require('chai-as-promised'))

// external
var Hermes = require('runnable-hermes')
var Promise = require('bluebird')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal (being tested)
var rabbitmqHelper = require('tasks/utils/rabbitmq')

describe('RabbitMQ Helper', function () {
  beforeEach(function () {
    sinon.stub(Hermes.prototype, 'connect').yieldsAsync()
  })
  afterEach(function () {
    Hermes.prototype.connect.restore()
  })

  it('should return a client for Promise.using', function () {
    var rabbitmqPromise = rabbitmqHelper(['queue:one'])
    return assert.isFulfilled(
      Promise.using(rabbitmqPromise, function (client) {
        assert.ok(client)
        assert.instanceOf(client, Hermes)
        assert.deepEqual(client.getQueues(), ['queue:one'])
        sinon.assert.calledOnce(Hermes.prototype.connect)
      })
    )
  })

  it('should throw an error without a string array', function () {
    var rabbitmqPromise = rabbitmqHelper()
    return assert.isRejected(
      Promise.using(rabbitmqPromise, function () {
        throw new Error('task should have thrown an error')
      }),
      TaskFatalError,
      /string.+array/
    )
  })

  it('should throw an error with an invalid string array', function () {
    var rabbitmqPromise = rabbitmqHelper([2])
    return assert.isRejected(
      Promise.using(rabbitmqPromise, function () {
        throw new Error('task should have thrown an error')
      }),
      TaskFatalError,
      /string.+array/
    )
  })
})
