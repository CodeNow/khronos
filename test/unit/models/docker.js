'use strict'

require('loadenv')({ debugName: 'khronos:test' })

var chai = require('chai')
var assert = chai.assert

// external
var Dockerode = require('dockerode')
var sinon = require('sinon')
var url = require('url')

// internal (being tested)
var Docker = require('models/docker')
var docker = new Docker(url.format({
  protocol: 'http:',
  hostname: process.env.KHRONOS_DOCKER_HOST,
  port: process.env.KHRONOS_DOCKER_PORT
}))

describe('Docker Model', function () {
  describe('getContainers', function () {
    var mockContainers = [{
      Id: 1,
      Image: 'ubuntu'
    }, {
      Id: 2,
      Image: 'centos'
    }]
    beforeEach(function () {
      sinon.stub(Dockerode.prototype, 'listContainers')
        .yieldsAsync(null, mockContainers)
    })
    afterEach(function () {
      Dockerode.prototype.listContainers.restore()
    })

    it('should return containers', function (done) {
      docker.getContainers(function (err, containers) {
        if (err) { return done(err) }
        assert.lengthOf(containers, 2)
        assert.deepEqual(containers, mockContainers)
        assert.ok(Dockerode.prototype.listContainers.calledOnce)
        done()
      })
    })
    it('should filter containers', function (done) {
      var filters = [/centos/]
      docker.getContainers({}, filters, function (err, containers) {
        if (err) { return done(err) }
        assert.lengthOf(containers, 1)
        assert.deepEqual(containers, [mockContainers[1]])
        assert.ok(Dockerode.prototype.listContainers.calledOnce)
        done()
      })
    })
  })

  describe('getImages', function () {
    var mockImages
    beforeEach(function () {
      mockImages = [{
        Id: 1,
        Created: Date.now(),
        RepoTags: [process.env.KHRONOS_DOCKER_REGISTRY + '/1/ubuntu:latest']
      }, {
        Id: 2,
        Created: Date.now(),
        RepoTags: ['<none>']
      }, {
        Id: 3,
        Created: Date.now(),
        RepoTags: ['redis:foot']
      }]
      sinon.stub(Dockerode.prototype, 'listImages')
        .yieldsAsync(null, mockImages)
    })
    afterEach(function () {
      Dockerode.prototype.listImages.restore()
    })

    it('should return tagged and untagged images', function (done) {
      docker.getImages(function (err, images, taglessImages) {
        if (err) { return done(err) }
        assert.lengthOf(images, 1)
        assert.lengthOf(taglessImages, 1)
        assert.deepEqual(images, [mockImages[0].RepoTags[0]])
        assert.deepEqual(taglessImages, [mockImages[1]])
        assert.ok(Dockerode.prototype.listImages.calledOnce)
        done()
      })
    })
  })
})
