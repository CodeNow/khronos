'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var it = lab.it;

var assert = require('chai').assert;
var pluck = require('101/pluck');
var request = require('request');
var sinon = require('sinon');

var Mavis = require('models/mavis');

describe('Mavis Model', function () {
  var mavis;
  beforeEach(function (done) {
    mavis = new Mavis();
    done();
  });

  it('should fetch docks', function (done) {
    var docks = require('../mocks/mavis/docks.json');
    var expectedHosts = docks.map(pluck('host'));
    sinon.stub(request, 'get').yields(null, {}, JSON.stringify(docks));

    mavis.getDocks(function (err, docks) {
      request.get.restore();
      assert.isNull(err);
      assert.lengthOf(docks, 1, 'number of docks');
      assert.include(docks, 'http://localhost:5454',  'expected dock');
      done();
    });
  });

  it('should return an error if mavis fails', function (done) {
    sinon.stub(request, 'get').yields(new Error('some error'));

    mavis.getDocks(function (err) {
      request.get.restore();
      assert.ok(err);
      assert.equal(err.message, 'some error');
      done();
    });
  });

  it('should return an error body cannot be parsed', function (done) {
    sinon.stub(request, 'get').yields(null, {}, '{ invalid: "json" }');

    mavis.getDocks(function (err) {
      request.get.restore();
      assert.ok(err);
      assert.match(err.message, /unexpected token/i);
      done();
    });
  });

  it('should allow us to override the docks', function (done) {
    sinon.stub(request, 'get').yields(new Error('some error'));
    process.env.KHRONOS_DOCKS = [
      'http://example.com:1234',
      'http://example.com:4567'
    ].join(',');

    mavis.getDocks(function (err, docks) {
      var stub = request.get;
      request.get.restore();
      assert.isNull(err);
      assert.isFalse(stub.calledOnce);
      assert.include(docks, 'http://example.com:1234');
      assert.include(docks, 'http://example.com:4567');
      done();
    });
  });
});
