'use strict';

require('loadenv')('khronos:test');

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;
var describe = lab.describe;
var it = lab.it;

var Dockerode = require('dockerode');
var assert = require('chai').assert;
var sinon = require('sinon');
var url = require('url');

var Docker = require('models/docker');
var docker = new Docker(url.format({
  protocol: 'http:',
  hostname: process.env.KHRONOS_DOCKER_HOST,
  port: process.env.KHRONOS_DOCKER_PORT
}));

describe('Docker Model', function () {
  describe('getContainers', function () {
    var mockContainers = [{
      Id: 1,
      Image: 'ubuntu'
    }, {
      Id: 2,
      Image: 'ubuntu'
    }];
    beforeEach(function (done) {
      sinon.stub(Dockerode.prototype, 'listContainers').yieldsAsync(null, mockContainers);
      done();
    });
    afterEach(function (done) {
      Dockerode.prototype.listContainers.restore();
      done();
    });

    it('should return containers', function (done) {
      docker.getContainers(function (err, containers) {
        if (err) { return done(err); }
        assert.lengthOf(containers, 2);
        assert.deepEqual(containers, mockContainers);
        assert.ok(Dockerode.prototype.listContainers.calledOnce);
        done();
      });
    });
  });

  describe('getImages', function () {
    var mockImages = [{
      Id: 1,
      Created: Date.now(),
      RepoTags: [process.env.KHRONOS_DOCKER_REGISTRY + '/1/ubuntu:latest']
    }, {
      Id: 2,
      Created: Date.now(),
      RepoTags: ['<none>']
    }];
    beforeEach(function (done) {
      sinon.stub(Dockerode.prototype, 'listImages').yieldsAsync(null, mockImages);
      done();
    });
    afterEach(function (done) {
      Dockerode.prototype.listImages.restore();
      done();
    });

    it('should return tagged and untagged images', function (done) {
      docker.getImages(function (err, images, taglessImages) {
        if (err) { return done(err); }
        assert.lengthOf(images, 1);
        assert.lengthOf(taglessImages, 1);
        assert.deepEqual(images, [mockImages[0].RepoTags[0]]);
        assert.deepEqual(taglessImages, [mockImages[1]]);
        assert.ok(Dockerode.prototype.listImages.calledOnce);
        done();
      });
    });
  });
});
