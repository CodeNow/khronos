'use strict';

require('loadenv')('khronos:test');

var chai = require('chai');
var assert = chai.assert;

// external
var Hermes = require('runnable-hermes');
var sinon = require('sinon');
var TaskFatalError = require('ponos').TaskFatalError;

// internal (being tested)
var rabbitmqFactory = require('models/rabbitmq');

describe('RabbitMQ Factory', function () {
  beforeEach(function (done) {
    sinon.spy(rabbitmqFactory, '_createClient');
    done();
  });
  afterEach(function (done) {
    rabbitmqFactory._createClient.restore();
    done();
  });

  it('should have default arguments', function (done) {
    var queues = ['queue:one'];
    var r = rabbitmqFactory(queues);
    assert.instanceOf(r, Hermes, 'returned a Hermes client');
    assert.deepEqual(r.getQueues(), queues);
    assert.ok(rabbitmqFactory._createClient.calledOnce, 'createClient called');
    assert.deepEqual(rabbitmqFactory._createClient.firstCall.args[0], {
      hostname: 'localhost',
      port: 5672,
      username: 'guest',
      password: 'guest',
      queues: queues
    });
    done();
  });
  it('should respect environment variables', function (done) {
    var envs = {
      HOSTNAME: 'foobar',
      PORT: 42,
      USERNAME: 'luke',
      PASSWORD: 'skywalker'
    };
    Object.keys(envs).forEach(function (k) {
      var oldVal = process.env['RABBITMQ_' + k];
      process.env['RABBITMQ_' + k] = envs[k];
      envs[k] = oldVal;
    });
    var queues = ['queue:one'];
    var r = rabbitmqFactory(queues);
    assert.deepEqual(r.getQueues(), queues);
    assert.ok(rabbitmqFactory._createClient.calledOnce, 'createClient called');
    assert.deepEqual(rabbitmqFactory._createClient.firstCall.args[0], {
      hostname: 'foobar',
      port: 42,
      username: 'luke',
      password: 'skywalker',
      queues: queues
    });
    Object.keys(envs).forEach(function (k) {
      process.env['RABBITMQ_' + k] = envs[k];
    });
    done();
  });
  it('should throw without queues', function (done) {
    assert.throws(function () { rabbitmqFactory(); },
      TaskFatalError, /string.+array/);
    done();
  });
  it('should throw with invalid queues', function (done) {
    assert.throws(function () { rabbitmqFactory([2]); },
      TaskFatalError, /string.+array/);
    done();
  });
});
