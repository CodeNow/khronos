'use strict';

require('loadenv')('khronos:test');

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var it = lab.it;
var assert = require('chai').assert;

var Hermes = require('runnable-hermes');
var Mavis = require('../../../../lib/models/mavis');
var sinon = require('sinon');
var TaskFatalError = require('ponos').TaskFatalError;

var enqueueDockJobsHelper =
  require('../../../../lib/tasks/utils/enqueue-dock-jobs');

describe('Enqueue Dock Jobs Helper', function () {
  beforeEach(function (done) {
    sinon.stub(Hermes.prototype, 'connect').yieldsAsync();
    sinon.stub(Hermes.prototype, 'publish').returns();
    sinon.stub(Mavis.prototype, 'getDocks').returns(['http://example.com']);
    done();
  });
  afterEach(function (done) {
    Hermes.prototype.connect.restore();
    Hermes.prototype.publish.restore();
    Mavis.prototype.getDocks.restore();
    done();
  });

  it('should enforce a string target queue', function (done) {
    assert.throws(function () { enqueueDockJobsHelper(); }, TaskFatalError);
    assert.throws(function () { enqueueDockJobsHelper(4); }, TaskFatalError);
    done();
  });
  it('should return a promise resolving the number of jobs', function (done) {
    enqueueDockJobsHelper('queue:one')
      .then(function (result) {
        assert.equal(result, 1, 'had 1 host');
        assert.ok(Hermes.prototype.publish.calledOnce, 'one job published');
        assert.equal(
          Hermes.prototype.publish.firstCall.args[0],
          'queue:one',
          'publishes to the correct queue');
        assert.deepEqual(
          Hermes.prototype.publish.firstCall.args[1],
          { dockerHost: 'http://example.com' },
          'publishes a vaild job');
        done();
      })
      .catch(done);
  });
  it('should throw if mavis errors', function (done) {
    Mavis.prototype.getDocks.throws(new Error('foobar'));
    enqueueDockJobsHelper('queue:one')
      .then(function () {
        throw new Error('helper should have thrown an error');
      })
      .catch(function (err) {
        assert.instanceOf(err, Error);
        assert.equal(err.message, 'foobar');
        done();
      })
      .catch(done);
  });
  it('should throw if rabbitmq errors', function (done) {
    Hermes.prototype.connect.throws(new Error('foobar'));
    enqueueDockJobsHelper('queue:one')
      .then(function () {
        throw new Error('helper should have thrown an error');
      })
      .catch(function (err) {
        assert.instanceOf(err, Error);
        assert.equal(err.message, 'foobar');
        done();
      })
      .catch(done);
  });
});
