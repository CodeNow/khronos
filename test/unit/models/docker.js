'use strict'

require('loadenv')({ debugName: 'khronos:test' })

const chai = require('chai')
const assert = chai.assert

// external
const sinon = require('sinon')
const Promise = require('bluebird')
require('sinon-as-promised')(Promise)
const url = require('url')

// internal (being tested)
const Docker = require('models/docker')
const docker = new Docker(url.format({
  protocol: 'http:',
  hostname: process.env.KHRONOS_DOCKER_HOST,
  port: process.env.KHRONOS_DOCKER_PORT
}))

describe('Docker Model', function () {
  describe('getContainers', function () {
    var mockContainers = [{
      Id: '1',
      Image: 'ubuntu'
    }, {
      Id: '2',
      Image: 'centos'
    }, {
      Id: '3',
      Image: 'ubuntu'
    }, {
      Id: '4',
      Image: 'ubuntu'
    }]
    beforeEach(function () {
      sinon.stub(Docker.prototype, 'listContainersAsync')
        .resolves(mockContainers)
    })
    afterEach(function () {
      Docker.prototype.listContainersAsync.restore()
    })

    it('should fail if listContainersAsync failed', function (done) {
      Docker.prototype.listContainersAsync.rejects(new Error('Docker error'))
      docker.getContainers()
      .then(() => {
        throw new Error('Should never happen')
      })
      .catch((err) => {
        assert.equal(err.message, 'Docker error')
        done()
      })
    })

    it('should return containers', function (done) {
      docker.getContainers()
        .asCallback(function (err, containers) {
          if (err) { return done(err) }
          assert.lengthOf(containers, 4)
          assert.deepEqual(containers, mockContainers)
          assert.ok(Docker.prototype.listContainersAsync.calledOnce)
          done()
        })
    })

    it('should filter containers', function (done) {
      var filters = [/centos/]
      docker.getContainers({}, filters)
        .asCallback(function (err, containers) {
          if (err) { return done(err) }
          assert.lengthOf(containers, 1)
          assert.deepEqual(containers, [mockContainers[1]])
          assert.ok(Docker.prototype.listContainersAsync.calledOnce)
          done()
        })
    })

    it('should filter out the container ids from containerIdsToFilterOut', function (done) {
      docker.getContainers({}, [/ubuntu/], ['1', '3'])
        .asCallback(function (err, containers) {
          if (err) { return done(err) }
          assert.lengthOf(containers, 1)
          assert.deepEqual(containers, [mockContainers[3]])
          assert.ok(Docker.prototype.listContainersAsync.calledOnce)
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
      sinon.stub(Docker.prototype, 'listImagesAsync').resolves(mockImages)
    })
    afterEach(function () {
      Docker.prototype.listImagesAsync.restore()
    })

    it('should fail if listImagesAsync failed', function (done) {
      Docker.prototype.listImagesAsync.rejects(new Error('Docker error'))
      docker.getImages()
      .then(() => {
        throw new Error('Should never happen')
      })
      .catch((err) => {
        assert.equal(err.message, 'Docker error')
        done()
      })
    })

    it('should return tagged and untagged images', function (done) {
      docker.getImages()
      .spread(function (images, taglessImages) {
        assert.lengthOf(images, 1)
        assert.lengthOf(taglessImages, 1)
        assert.deepEqual(images, [mockImages[0].RepoTags[0]])
        assert.deepEqual(taglessImages, [mockImages[1]])
        assert.ok(Docker.prototype.listImagesAsync.calledOnce)
        done()
      })
      .catch(done)
    })
  })

  describe('pull', () => {
    const imageName = 'some:image'
    const mockStream = 'some-mock-stream'

    beforeEach(() => {
      sinon.stub(docker, 'pullAsync').resolves(mockStream)
      sinon.stub(docker.client.modem, 'followProgress').yieldsAsync()
    })

    afterEach(() => {
      docker.pullAsync.restore()
      docker.client.modem.followProgress.restore()
    })

    it('should fail if pullAsync failed', (done) => {
      docker.pullAsync.rejects(new Error('Docker pull error'))
      docker.pull(imageName)
      .then(() => {
        throw new Error('Should never happen')
      })
      .catch((err) => {
        assert.equal(err.message, 'Docker pull error')
        done()
      })
    })

    it('should fail if followProgress failed', (done) => {
      docker.client.modem.followProgress.yieldsAsync(new Error('Docker pull stream error'))
      docker.pull(imageName)
      .then(() => {
        throw new Error('Should never happen')
      })
      .catch((err) => {
        assert.equal(err.message, 'Docker pull stream error')
        done()
      })
    })

    it('should call pullAsync', () => {
      return assert.isFulfilled(docker.pull(imageName))
        .then(() => {
          sinon.assert.calledOnce(docker.pullAsync)
          sinon.assert.calledWith(docker.pullAsync, imageName)
        })
    })

    it('should follow the pull progress via the pull stream', () => {
      return assert.isFulfilled(docker.pull(imageName))
        .then(() => {
          sinon.assert.calledOnce(docker.client.modem.followProgress)
          sinon.assert.calledWith(
            docker.client.modem.followProgress,
            mockStream
          )
        })
    })
  })
})
