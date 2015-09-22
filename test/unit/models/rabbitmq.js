'use strict';

require('loadenv')('khronos:test');

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = require('chai').assert;

var TaskFatalError = require('ponos').TaskFatalError;

var rabbitmqFactory = require('../../../lib/models/rabbitmq');

describe('RabbitMQ Factory', function () {
  it('should have default arguments', function (done) {
    var queues = ['queue:one'];
    var r = rabbitmqFactory(queues);
    assert.deepEqual(r.queues, queues);
    assert.deepEqual(r.opts, {
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
    assert.deepEqual(r.queues, queues);
    assert.deepEqual(r.opts, {
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
