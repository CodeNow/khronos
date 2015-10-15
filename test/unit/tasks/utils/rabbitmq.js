'use strict';

require('loadenv')('khronos:test');

var chai = require('chai');
var assert = chai.assert;

// external
var Hermes = require('runnable-hermes');
var Promise = require('bluebird');
var sinon = require('sinon');
var TaskFatalError = require('ponos').TaskFatalError;

// internal (being tested)
var rabbitmqHelper = require('tasks/utils/rabbitmq');

describe('RabbitMQ Helper', function () {
  beforeEach(function (done) {
    sinon.stub(Hermes.prototype, 'connect').yieldsAsync();
    done();
  });
  afterEach(function (done) {
    Hermes.prototype.connect.restore();
    done();
  });

  it('should return a client for Promise.using', function (done) {
    var rabbitmqPromise = rabbitmqHelper(['queue:one']);
    Promise.using(rabbitmqPromise, function (client) {
      assert.ok(client);
      assert.instanceOf(client, Hermes);
      assert.deepEqual(client.getQueues(), ['queue:one']);
      assert.ok(Hermes.prototype.connect.calledOnce, 'hermes connected');
      done();
    })
    .catch(done);
  });
  it('should throw an error without a string array', function (done) {
    var rabbitmqPromise = rabbitmqHelper();
    Promise.using(rabbitmqPromise, function () {
      throw new Error('task should have thrown an error');
    })
    .catch(function (err) {
      assert.instanceOf(err, TaskFatalError);
      assert.match(err.message, /string.+array/);
      done();
    })
    .catch(done);
  });
  it('should throw an error with an invalid string array', function (done) {
    var rabbitmqPromise = rabbitmqHelper([2]);
    Promise.using(rabbitmqPromise, function () {
      throw new Error('task should have thrown an error');
    })
    .catch(function (err) {
      assert.instanceOf(err, TaskFatalError);
      assert.match(err.message, /string.+array/);
      done();
    })
    .catch(done);
  });
});
