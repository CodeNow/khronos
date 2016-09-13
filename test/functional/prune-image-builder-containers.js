'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
const chai = require('chai')
const nock = require('nock')
const async = require('async')
const Container = require('dockerode/lib/container')
const Docker = require('dockerode')
const dockerMock = require('docker-mock')
const rabbitmq = require('models/rabbitmq')
const ponos = require('ponos')
const sinon = require('sinon')
const swarmInfoMock = require('swarmerode/test/fixtures/swarm-info')
const mongodbFactory = require('../factories/mongodb')

// internal
const dockerFactory = require('../factories/docker')

chai.use(require('chai-as-promised'))
const assert = chai.assert
const expect = chai.expect

const docker = new Docker({
  host: process.env.KHRONOS_DOCKER_HOST,
  port: process.env.KHRONOS_DOCKER_PORT
})

describe('Prune Exited Image-Builder Containers', function () {
  var tasks = {
    'containers.delete': require('../../lib/tasks/containers/delete'),
    'containers.image-builder.prune': require('../../lib/tasks/image-builder/prune'),
    'containers.image-builder.prune-dock': require('../../lib/tasks/image-builder/prune-dock')
  }
  var dockerMockServer
  var workerServer

  before(function (done) {
    dockerMockServer = dockerMock.listen(process.env.KHRONOS_DOCKER_PORT, done)
  })
  beforeEach(function () {
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
  beforeEach(function (done) {
    rabbitmq.disconnect().asCallback(done)
  })
  beforeEach(function () {
    sinon.spy(Container.prototype, 'remove')
    sinon.spy(tasks, 'containers.image-builder.prune-dock')
    sinon.spy(tasks, 'containers.delete')
    const opts = {
      name: process.env.APP_NAME,
      hostname: process.env.RABBITMQ_HOSTNAME,
      port: process.env.RABBITMQ_PORT,
      username: process.env.RABBITMQ_USERNAME || 'guest',
      password: process.env.RABBITMQ_PASSWORD || 'guest',
      tasks: tasks
    }
    workerServer = new ponos.Server(opts)
    return assert.isFulfilled(Promise.all([rabbitmq.connect(), workerServer.start()]))
  })
  afterEach(function () {
    return assert.isFulfilled(Promise.all([rabbitmq.disconnect(), workerServer.stop()]))
  })
  afterEach(function (done) {
    Container.prototype.remove.restore()
    tasks['containers.image-builder.prune-dock'].restore()
    tasks['containers.delete'].restore()
    dockerFactory.deleteAllImagesAndContainers(docker, done)
  })
  afterEach(function () {
    nock.cleanAll()
  })
  after(function (done) {
    dockerMockServer.close(done)
  })
  afterEach(function (done) {
    async.parallel([
      mongodbFactory.removeAllContextVersions,
      mongodbFactory.removeAllInstances,
      mongodbFactory.removeAllBuilds
    ], done)
  })
  afterEach(function (done) {
    rabbitmq.disconnect().asCallback(done)
  })
  describe('unpopulated dock', function () {
    it('should run successfully', function (done) {
      rabbitmq.publishTask('containers.image-builder.prune', {})
      async.until(
        function () {
          var pruneDockTaskCallCount =
          tasks['containers.image-builder.prune-dock'].callCount
          return pruneDockTaskCallCount === 1
        },
        function (cb) { setTimeout(cb, 100) },
        function (err) {
          if (err) { return done(err) }
          expect(Container.prototype.remove.callCount).to.equal(0)
          setTimeout(done, 100)
        })
    })
  })

  describe('on a populated dock', function () {
    beforeEach(function (done) {
      dockerFactory.createRandomContainers(docker, 5, done)
    })

    it('should run with no iamge-builder containers', function (done) {
      rabbitmq.publishTask('containers.image-builder.prune', {})
      async.doUntil(
        function (cb) { setTimeout(cb, 100) },
        function () {
          var pruneDockTaskCallCount =
          tasks['containers.image-builder.prune-dock'].callCount
          return pruneDockTaskCallCount === 1
        },
        function (err) {
          if (err) { return done(err) }
          expect(Container.prototype.remove.callCount).to.equal(0)
          dockerFactory.listContainersAndAssert(
            docker,
            function (containers) { expect(containers).to.have.length(5) },
            function (err) {
              if (err) { return done(err) }
              setTimeout(done, 100)
            })
        })
    })

    describe('with multiple docks', function () {
      beforeEach(function () {
        nock.cleanAll()
        nock('http://localhost:4242', { allowUnmocked: true })
          .persist()
          .get('/info')
          .reply(200, swarmInfoMock([{
            host: 'localhost:5454'
          }, {
            host: 'localhost:5454'
          }]))
        nock('http://127.0.0.1:8500', { allowUnmocked: true })
          .persist()
          .get('/v1/kv/swarm/docker/swarm/nodes/?recurse=true')
          .reply(200, [
            { Key: 'swarm/docker/swarm/nodes/localhost:5454',
              Value: 'localhost:5454' },
            { Key: 'swarm/docker/swarm/nodes/localhost:5454',
              Value: 'localhost:5454' }
          ])
      })
      it('should run successfully', function (done) {
        rabbitmq.publishTask('containers.image-builder.prune', {})
        async.doUntil(
          function (cb) { setTimeout(cb, 100) },
          function () {
            var pruneDockTaskCallCount =
              tasks['containers.image-builder.prune-dock'].callCount
            return pruneDockTaskCallCount === 2
          },
          function (err) {
            if (err) { return done(err) }
            expect(Container.prototype.remove.callCount).to.equal(0)
            dockerFactory.listContainersAndAssert(
              docker,
              function (containers) { expect(containers).to.have.length(5) },
              function (err) {
                if (err) { return done(err) }
                setTimeout(done, 100)
              })
          })
      })
    })

    describe('where image-builder containers are present', function () {
      beforeEach(function () {
        nock.cleanAll()
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
      var containerId
      beforeEach(function (done) {
        dockerFactory.createImageBuilderContainers(docker, 2, function (err, containers) {
          containerId = containers[0].id
          done(err)
        })
      })
      beforeEach(function (done) {
        var instance = {
          contextVersion: {
            build: {
              dockerContainer: containerId
            },
            dockerHost: 'http://localhost:5454'
          }
        }
        mongodbFactory.createInstance(instance, done)
      })

      it('should only remove dead image-builder containers', function (done) {
        rabbitmq.publishTask(
          'containers.image-builder.prune',
          {})
        async.doUntil(
          function (cb) { setTimeout(cb, 100) },
          function () {
            return Container.prototype.remove.callCount === 1
          },
          function (err) {
            if (err) { return done(err) }
            var pruneDockTaskCallCount =
              tasks['containers.image-builder.prune-dock'].callCount
            expect(pruneDockTaskCallCount).to.equal(1)
            expect(tasks['containers.delete'].callCount).to.equal(1)
            // 6 containers for: 5 user containers + 1 build container (1 was removed)
            dockerFactory.listContainersAndAssert(
              docker,
              function (containers) { expect(containers).to.have.length(6) },
              function (err) {
                if (err) { return done(err) }
                setTimeout(done, 100)
              })
          })
      })
    })
  })
})
