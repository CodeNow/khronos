'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
var assert = chai.assert

// external
var Bunyan = require('bunyan')
var Promise = require('bluebird')
var request = require('request')
var sinon = require('sinon')

// internal (being tested)
var Mavis = require('models/mavis')

describe('Mavis Model', function () {
  var mavis
  beforeEach(function (done) {
    sinon.stub(Bunyan.prototype, 'error').returns()
    mavis = new Mavis()
    done()
  })
  afterEach(function (done) {
    Bunyan.prototype.error.restore()
    done()
  })

  it('should fetch docks', function (done) {
    var docks = require('../../mocks/mavis/docks.json')
    sinon.stub(request, 'get').yields(null, {}, JSON.stringify(docks))

    mavis.getDocks()
      .then(function (docks) {
        request.get.restore()
        assert.lengthOf(docks, 1, 'number of docks')
        assert.include(docks, 'http://localhost:5454', 'expected dock')
        done()
      })
      .catch(done)
  })

  it('should return an error if mavis fails', function (done) {
    sinon.stub(request, 'get').yields(new Error('some error'))

    mavis.getDocks()
      .then(function () {
        done(new Error('mavis should have errored'))
      })
      .catch(function (err) {
        request.get.restore()
        assert.equal(err.message, 'some error')
        done()
      })
  })

  it('should return an error body cannot be parsed', function (done) {
    sinon.stub(request, 'get').yields(null, {}, '{ invalid: "json" }')

    mavis.getDocks()
      .then(function () {
        done(new Error('mavis should have errored'))
      })
      .catch(function (err) {
        request.get.restore()
        assert.ok(err)
        assert.match(err.message, /unexpected token/i)
        done()
      })
  })

  describe('verifyHost', function () {
    beforeEach(function (done) {
      sinon.stub(mavis, 'getDocks')
        .returns(Promise.resolve(['http://example.com:5555']))
      done()
    })
    afterEach(function (done) {
      mavis.getDocks.restore()
      done()
    })
    it('should verify a host that exists', function (done) {
      mavis.verifyHost('http://example.com:5555')
        .then(function (host) {
          assert.equal(host, 'http://example.com:5555')
          done()
        })
        .catch(done)
    })
    it('should throw with host that does not exist', function (done) {
      mavis.verifyHost('http://example.com:1234')
        .then(function () {
          throw new Error('verifyHost should have thrown')
        })
        .catch(function (err) {
          assert.instanceOf(err, Mavis.InvalidHostError)
          assert.match(err.message, /no longer exists/)
          done()
        })
        .catch(done)
    })
  })

  describe('defaulting the docks', function () {
    var prevDocks
    beforeEach(function (done) {
      prevDocks = process.env.KHRONOS_DOCKS
      process.env.KHRONOS_DOCKS = [
        'http://example.com:1234',
        'http://example.com:4567'
      ].join(',')
      done()
    })
    afterEach(function (done) {
      process.env.KHRONOS_DOCKS = prevDocks
      done()
    })

    it('should allow us to override the docks', function (done) {
      sinon.stub(request, 'get').yields(new Error('some error'))

      mavis.getDocks()
        .then(function (docks) {
          var stub = request.get
          request.get.restore()
          assert.isFalse(stub.calledOnce)
          assert.include(docks, 'http://example.com:1234')
          assert.include(docks, 'http://example.com:4567')
          done()
        })
        .catch(done)
    })
  })
})
