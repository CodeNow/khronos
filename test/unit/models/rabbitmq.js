'use strict'

require('loadenv')({ debugName: 'khronos:test' })

var chai = require('chai')
var assert = chai.assert

// external
var Hermes = require('runnable-hermes')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

// internal (being tested)
var rabbitmqFactory = require('models/rabbitmq')

describe('RabbitMQ Factory', function () {
  beforeEach(function () {
    sinon.spy(rabbitmqFactory, '_createClient')
  })
  afterEach(function () {
    rabbitmqFactory._createClient.restore()
  })

  it('should have default arguments', function () {
    var queues = ['queue:one']
    var r = rabbitmqFactory(queues)
    assert.instanceOf(r, Hermes, 'returned a Hermes client')
    assert.deepEqual(r.getQueues(), queues)
    sinon.assert.calledOnce(rabbitmqFactory._createClient)
    sinon.assert.calledWithExactly(
      rabbitmqFactory._createClient,
      {
        name: 'khronos',
        hostname: 'localhost',
        port: 5672,
        username: 'guest',
        password: 'guest',
        prefetch: 3,
        queues: queues,
        subscribedEvents: undefined
      }
    )
  })

  it('should respect environment variables', function () {
    var envs = {
      HOSTNAME: 'foobar',
      PORT: 42,
      USERNAME: 'luke',
      PASSWORD: 'skywalker'
    }
    Object.keys(envs).forEach(function (k) {
      var oldVal = process.env['RABBITMQ_' + k]
      process.env['RABBITMQ_' + k] = envs[k]
      envs[k] = oldVal
    })
    var queues = ['queue:one']
    var r = rabbitmqFactory(queues)
    assert.deepEqual(r.getQueues(), queues)
    sinon.assert.calledOnce(rabbitmqFactory._createClient)
    sinon.assert.calledWithExactly(
      rabbitmqFactory._createClient,
      {
        name: 'khronos',
        hostname: 'foobar',
        port: 42,
        username: 'luke',
        password: 'skywalker',
        prefetch: 3,
        queues: queues,
        subscribedEvents: undefined
      }
    )
    Object.keys(envs).forEach(function (k) {
      process.env['RABBITMQ_' + k] = envs[k]
    })
  })

  it('should throw without queues', function () {
    assert.throws(
      function () { rabbitmqFactory() },
      TaskFatalError,
      /string.+array/
    )
  })

  it('should throw with invalid queues', function () {
    assert.throws(
      function () { rabbitmqFactory([2]) },
      TaskFatalError,
      /string.+array/
    )
  })
})
