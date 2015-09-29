'use strict';

require('loadenv')('khronos:test');

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var it = lab.it;
var assert = require('chai').assert;

// external
var Promise = require('bluebird');
var sinon = require('sinon');

// internal
var MongoDB = require('models/mongodb');

// internal (being tested)
var mongodbHelper = require('tasks/utils/mongodb');

describe('MongoDB Helper', function () {
  beforeEach(function (done) {
    sinon.stub(MongoDB.prototype, 'close').yieldsAsync();
    sinon.stub(MongoDB.prototype, 'connect').yieldsAsync();
    done();
  });
  afterEach(function (done) {
    MongoDB.prototype.close.restore();
    MongoDB.prototype.connect.restore();
    done();
  });

  it('should return a client for Promise.using', function (done) {
    var mongodbPromise = mongodbHelper(['queue:one']);
    Promise.using(mongodbPromise, function (client) {
      assert.ok(client);
      assert.instanceOf(client, MongoDB);
      assert.ok(MongoDB.prototype.connect.calledOnce, 'mongodb connected');
      assert.notOk(MongoDB.prototype.close.calledOnce, 'mongodb not closed');
      done();
    })
    .catch(done);
  });
  it('should close the client if it was being used', function (done) {
    var mongodbPromise = mongodbHelper(['queue:one']);
    Promise.using(mongodbPromise, function (client) {
      throw new Error('foobar');
      assert.ok(client);
      assert.instanceOf(client, MongoDB);
      assert.ok(MongoDB.prototype.connect.calledOnce, 'mongodb connected');
      done();
    })
    .catch(function (err) {
      assert.ok(MongoDB.prototype.close.calledOnce, 'mongodb closed');
      assert.equal(err.message, 'foobar');
      done();
    })
    .catch(done);
  });
});
