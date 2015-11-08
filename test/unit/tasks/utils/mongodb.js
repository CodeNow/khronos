'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert

// external
var Promise = require('bluebird')
var sinon = require('sinon')

// internal
var MongoDB = require('models/mongodb')

// internal (being tested)
var mongodbHelper = require('tasks/utils/mongodb')

describe('MongoDB Helper', function () {
  beforeEach(function (done) {
    sinon.stub(MongoDB.prototype, 'close').yieldsAsync()
    sinon.stub(MongoDB.prototype, 'connect').yieldsAsync()
    done()
  })
  afterEach(function (done) {
    MongoDB.prototype.close.restore()
    MongoDB.prototype.connect.restore()
    done()
  })

  it('should return a client for Promise.using', function (done) {
    var mongodbPromise = mongodbHelper()
    Promise.using(mongodbPromise, function (client) {
      assert.ok(client)
      assert.instanceOf(client, MongoDB)
      assert.ok(MongoDB.prototype.connect.calledOnce, 'mongodb connected')
      assert.notOk(MongoDB.prototype.close.calledOnce, 'mongodb not closed')
      done()
    })
      .catch(done)
  })
  it('should close the client if it was being used', function (done) {
    var mongodbPromise = mongodbHelper()
    Promise.using(mongodbPromise, function (client) {
      assert.ok(client)
      assert.instanceOf(client, MongoDB)
      assert.ok(MongoDB.prototype.connect.calledOnce, 'mongodb connected')
      throw new Error('foobar')
    })
      .catch(function (err) {
        assert.ok(MongoDB.prototype.close.calledOnce, 'mongodb closed')
        assert.equal(err.message, 'foobar')
        done()
      })
      .catch(done)
  })
  it('should log an error if the client fails to close, but return true', function (done) {
    MongoDB.prototype.close.yieldsAsync(new Error('foobar'))
    var mongodbPromise = mongodbHelper()
    Promise.using(mongodbPromise, function () {
      return 1
    })
      .then(function (result) {
        // we don't actually get to see the error happen, and that's the point
        assert.ok(MongoDB.prototype.close.calledOnce, 'mongodb closed')
        assert.equal(result, 1)
        done()
      })
      .catch(done)
  })
})
