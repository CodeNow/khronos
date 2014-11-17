var async = require('async');
var chai = require('chai');
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var rewire = require('rewire');

var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var expect = chai.expect;

var config = JSON.parse(JSON.stringify(require('../config')));
config.network.port = 5555;

var dockerMock = require('docker-mock');
dockerMock.listen(config.network.port);

var docker = require('dockerode')({host:config.network.host, port:config.network.port});

// replace private variables for testing
var pruneContainers = rewire('../scripts/prune-containers');
pruneContainers.__set__('config', config);

var mocks = require('./mocks');

describe('prune-containers', function() {
  var containers = [];

  beforeEach(function(done) {
    async.forEach(mocks.containers, function(container, cb) {
      docker.createContainer(container, cb);
    }, done);
  });

  afterEach(function(done) {
    async.map(containers, function(container, cb) {
      container.remove(cb);
    }, done);
  });

  it('should delete containers older than 12 hours', function(done) {
    pruneContainers(done);
  });
});
