'use strict'

require('loadenv')('khronos:test')

var chai = require('chai')
chai.use(require('chai-as-promised'))
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
  var docks = require('../../mocks/mavis/docks.json')
  beforeEach(function () {
    sinon.stub(Bunyan.prototype, 'error').returns()
    mavis = new Mavis()
  })
  afterEach(function () {
    Bunyan.prototype.error.restore()
  })

  describe('getDocks', function () {
    beforeEach(function () {
      sinon.stub(mavis, 'getRawDocks').returns(Promise.resolve(docks))
    })
    afterEach(function () {
      mavis.getRawDocks.restore()
    })

    it('should return just the hosts', function () {
      return assert.isFulfilled(mavis.getDocks())
        .then(function (docks) {
          assert.lengthOf(docks, 1, 'number of docks')
          assert.include(docks, 'http://localhost:5454', 'expected dock')
        })
    })

    it('should handle an empty rawDocks', function () {
      mavis.getRawDocks.returns(Promise.resolve([]))
      return assert.isFulfilled(mavis.getDocks())
        .then(function (docks) {
          assert.lengthOf(docks, 0, 'number of docks')
        })
    })
  })

  describe('getRawDocks', function () {
    beforeEach(function () {
      sinon.stub(request, 'get').yields(null, {}, JSON.stringify(docks))
    })
    afterEach(function () {
      request.get.restore()
    })
    it('should fetch the docks', function () {
      return assert.isFulfilled(mavis.getRawDocks())
        .then(function (returnedDocks) {
          assert.lengthOf(returnedDocks, 1, 'number of docks')
          assert.include(returnedDocks, docks[0], 'expected dock')
        })
    })

    describe('network error', function () {
      beforeEach(function () {
        request.get.yields(new Error('some error'))
      })
      it('should return an error', function () {
        return assert.isRejected(mavis.getRawDocks())
          .then(function (err) {
            assert.include(err.message, 'some error')
          })
      })
    })

    describe('invalid body JSON', function () {
      beforeEach(function () {
        request.get.yields(null, {}, '{ invalid: "json" }')
      })
      it('should return an error', function () {
        return assert.isRejected(mavis.getRawDocks())
          .then(function (err) {
            assert.match(err.message, /unexpected token/i)
          })
      })
    })
  })

  describe('verifyHost', function () {
    beforeEach(function () {
      sinon.stub(mavis, 'getDocks')
        .returns(Promise.resolve(['http://example.com:5555']))
    })
    afterEach(function () {
      mavis.getDocks.restore()
    })
    it('should verify a host that exists', function () {
      return assert.isFulfilled(mavis.verifyHost('http://example.com:5555'))
        .then(function (host) {
          assert.equal(host, 'http://example.com:5555')
        })
    })
    it('should throw with host that does not exist', function () {
      return assert.isRejected(mavis.verifyHost('http://example.com:1234'))
        .then(function (err) {
          assert.instanceOf(err, Mavis.InvalidHostError)
          assert.match(err.message, /no longer exists/)
        })
    })
  })
})
