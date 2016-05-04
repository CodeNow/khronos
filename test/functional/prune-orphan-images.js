'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
const async = require('async')
const chai = require('chai')
const Docker = require('dockerode')
const dockerMock = require('docker-mock')
const Hermes = require('runnable-hermes')
const Image = require('dockerode/lib/image')
const nock = require('nock')
const ponos = require('ponos')
const sinon = require('sinon')
const swarmInfoMock = require('swarmerode/test/fixtures/swarm-info')

// internal
const dockerFactory = require('../factories/docker')
const mongodbFactory = require('../factories/mongodb')

chai.use(require('chai-as-promised'))
const assert = chai.assert

const docker = new Docker({
  host: process.env.KHRONOS_DOCKER_HOST,
  port: process.env.KHRONOS_DOCKER_PORT
})

describe('Prune Orphan Images', function () {
  var tasks = {
    'khronos:images:remove': require('../../lib/tasks/images/remove'),
    'khronos:images:prune': require('../../lib/tasks/images/prune'),
    'khronos:images:prune-dock': require('../../lib/tasks/images/prune-dock'),
    'khronos:images:check-against-context-versions':
      require('../../lib/tasks/images/check-against-context-versions')
  }
  var hermes = new Hermes({
    name: 'khronos',
    hostname: process.env.RABBITMQ_HOSTNAME,
    port: process.env.RABBITMQ_PORT,
    username: process.env.RABBITMQ_USERNAME || 'guest',
    password: process.env.RABBITMQ_PASSWORD || 'guest',
    queues: Object.keys(tasks)
  })
  var dockerMockServer
  var workerServer

  before(function (done) {
    dockerMockServer = dockerMock.listen(process.env.KHRONOS_DOCKER_PORT, done)
  })
  before(function () {
    nock('http://localhost:4242', { allowUnmocked: true })
      .persist()
      .get('/info')
      .reply(200, swarmInfoMock([{
        host: 'localhost:5454'
      }]))
    nock('http://127.0.0.1:8500', { allowUnmocked: true })
      .persist()
      .get('/v1/kv/swarm/docker/swarm/nodes/?recurse=true')
      .reply(200, [
        { Key: 'swarm/docker/swarm/nodes/localhost:5454',
          Value: 'localhost:5454' }
      ])
  })
  beforeEach(function () {
    sinon.spy(Image.prototype, 'remove')
    sinon.spy(Docker.prototype, 'listImages')
    // spy on all tasks
    Object.keys(tasks).forEach(function (t) { sinon.spy(tasks, t) })
    workerServer = new ponos.Server({ hermes: hermes })
    workerServer.setAllTasks(tasks)
    return assert.isFulfilled(workerServer.start())
  })
  afterEach(function () {
    return assert.isFulfilled(workerServer.stop())
  })
  afterEach(function (done) {
    Image.prototype.remove.restore()
    Docker.prototype.listImages.restore()
    // restore all methods
    Object.keys(tasks).forEach(function (t) { tasks[t].restore() })
    dockerFactory.deleteAllImagesAndContainers(docker, done)
  })
  afterEach(function (done) {
    mongodbFactory.removeAllContextVersions(done)
  })
  after(function () {
    nock.cleanAll()
  })
  after(function (done) {
    dockerMockServer.close(done)
  })

  describe('unpopulated dock', function () {
    it('should run successfully', function (done) {
      workerServer.hermes.publish('khronos:images:prune', {})
      async.doUntil(
        function (cb) { setTimeout(cb, 100) },
        function () {
          return tasks['khronos:images:prune-dock'].calledOnce &&
            Docker.prototype.listImages.calledOnce
        },
        function (err) {
          if (err) { return done(err) }
          sinon.assert.notCalled(Image.prototype.remove)
          setTimeout(done, 100)
        })
    })
  })

  describe('on a populated dock', function () {
    beforeEach(function (done) {
      var longTimeAgo = Math.floor((new Date().getTime() - Math.pow(10, 9)) / 1000)
      var opts = {
        fromImage: 'registry.runnable.com/100/bar',
        Created: longTimeAgo,
        tag: '012345678901234567890123' // 24 char object ID
      }
      dockerFactory.createImage(docker, opts, done)
    })

    it('should remove orphaned images', function (done) {
      workerServer.hermes.publish('khronos:images:prune', {})
      async.doUntil(
        function (cb) { setTimeout(cb, 100) },
        function () {
          return tasks['khronos:images:remove'].calledOnce &&
            Image.prototype.remove.calledOnce
        },
        function (err) {
          if (err) { return done(err) }
          sinon.assert.calledOnce(Image.prototype.remove)
          dockerFactory.listImagesAndAssert(
            docker,
            function (images) { assert.lengthOf(images, 0) },
            function (err) {
              if (err) { return done(err) }
              setTimeout(done, 100)
            })
        })
    })

    describe('with very new images', function () {
      beforeEach(function (done) {
        var createdDate = Math.floor((new Date().getTime()) / 1000)
        var opts = {
          fromImage: 'localhost/100/bar',
          Created: createdDate,
          tag: '012345678901234567898901' // 24 char object ID
        }
        dockerFactory.createImage(docker, opts, done)
      })

      it('should remove orphaned images, not new ones', function (done) {
        workerServer.hermes.publish('khronos:images:prune', {})
        async.doUntil(
          function (cb) { setTimeout(cb, 100) },
          function () {
            return tasks['khronos:images:remove'].calledOnce &&
              Image.prototype.remove.calledOnce
          },
          function (err) {
            if (err) { return done(err) }
            sinon.assert.calledOnce(Image.prototype.remove)
            dockerFactory.listImagesAndAssert(
              docker,
              function (images) { assert.lengthOf(images, 1) },
              function (err) {
                if (err) { return done(err) }
                setTimeout(done, 100)
              })
          })
      })
    })

    describe('with non-orphan images', function () {
      beforeEach(function (done) {
        var longTimeAgo = Math.floor((new Date().getTime() - Math.pow(10, 9)) / 1000)
        var opts = {
          fromImage: 'localhost/100/bar',
          Created: longTimeAgo,
          tag: '012345678901234567894567' // 24 char object ID
        }
        dockerFactory.createImage(docker, opts, done)
      })
      beforeEach(function (done) {
        mongodbFactory.createContextVersion({ _id: '012345678901234567894567' }, done)
      })

      it('should not remove non-orphaned images', function (done) {
        workerServer.hermes.publish('khronos:images:prune', {})
        async.doUntil(
          function (cb) { setTimeout(cb, 100) },
          function () {
            return tasks['khronos:images:remove'].calledOnce &&
              Image.prototype.remove.calledOnce
          },
          function (err) {
            if (err) { return done(err) }
            sinon.assert.calledOnce(Image.prototype.remove)
            dockerFactory.listImagesAndAssert(
              docker,
              function (images) {
                assert.lengthOf(images, 1)
              },
              function (err) {
                if (err) { return done(err) }
                setTimeout(done, 100)
              })
          })
      })
    })
  })
})
