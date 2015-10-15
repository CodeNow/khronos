'use strict';

require('loadenv')('khronos:test');

var chai = require('chai');
var assert = chai.assert;

// external
var Bunyan = require('bunyan');
var request = require('request');
var sinon = require('sinon');

// internal (being tested)
var Mavis = require('models/mavis');

describe('Mavis Model', function () {
  var mavis;
  beforeEach(function (done) {
    sinon.stub(Bunyan.prototype, 'error').returns();
    mavis = new Mavis();
    done();
  });
  afterEach(function (done) {
    Bunyan.prototype.error.restore();
    done();
  });

  it('should fetch docks', function (done) {
    var docks = require('../../mocks/mavis/docks.json');
    sinon.stub(request, 'get').yields(null, {}, JSON.stringify(docks));

    mavis.getDocks()
      .then(function (docks) {
        request.get.restore();
        assert.lengthOf(docks, 1, 'number of docks');
        assert.include(docks, 'http://localhost:5454', 'expected dock');
        done();
      })
      .catch(done);
  });

  it('should return an error if mavis fails', function (done) {
    sinon.stub(request, 'get').yields(new Error('some error'));

    mavis.getDocks()
      .then(function () {
        done(new Error('mavis should have errored'));
      })
      .catch(function (err) {
        request.get.restore();
        assert.equal(err.message, 'some error');
        done();
      });
  });

  it('should return an error body cannot be parsed', function (done) {
    sinon.stub(request, 'get').yields(null, {}, '{ invalid: "json" }');

    mavis.getDocks()
      .then(function () {
        done(new Error('mavis should have errored'));
      })
      .catch(function (err) {
        request.get.restore();
        assert.ok(err);
        assert.match(err.message, /unexpected token/i);
        done();
      });
  });

  describe('defaulting the docks', function () {
    var prevDocks;
    beforeEach(function (done) {
      prevDocks = process.env.KHRONOS_DOCKS;
      process.env.KHRONOS_DOCKS = [
        'http://example.com:1234',
        'http://example.com:4567'
      ].join(',');
      done();
    });
    afterEach(function (done) {
      process.env.KHRONOS_DOCKS = prevDocks;
      done();
    });

    it('should allow us to override the docks', function (done) {
      sinon.stub(request, 'get').yields(new Error('some error'));

      mavis.getDocks()
        .then(function (docks) {
          var stub = request.get;
          request.get.restore();
          assert.isFalse(stub.calledOnce);
          assert.include(docks, 'http://example.com:1234');
          assert.include(docks, 'http://example.com:4567');
          done();
        })
        .catch(done);
    });
  });
});
