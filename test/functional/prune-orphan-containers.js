'use strict'

require('loadenv')({ debugName: 'khronos:test' })

const async = require('async')
const chai = require('chai')
const Container = require('dockerode/lib/container')
const Docker = require('dockerode')
const dockerMock = require('docker-mock')
const rabbitmq = require('models/rabbitmq')
const nock = require('nock')
const ponos = require('ponos')
const sinon = require('sinon')
const swarmInfoMock = require('swarmerode/test/fixtures/swarm-info')

// internal
const dockerFactory = require('../factories/docker')
const mongodbFactory = require('../factories/mongodb')

chai.use(require('chai-as-promised'))
const assert = chai.assert
const expect = chai.expect

const docker = new Docker({
  host: process.env.KHRONOS_DOCKER_HOST,
  port: process.env.KHRONOS_DOCKER_PORT
})

describe('Prune Orphaned Containers', function () {
  var tasks = {
    'containers.orphan.prune': require('../../lib/tasks/containers/prune-orphans'),
    'containers.orphan.prune-dock': require('../../lib/tasks/containers/prune-orphans-dock'),
    'containers.orphan.check-against-mongo': require('../../lib/tasks/containers/check-against-mongo'),
    'containers.remove': require('../../lib/tasks/containers/remove')
  }
  var dockerMockServer
  var workerServer
  var prevMongo

  before(function (done) {
    prevMongo = process.env.KHRONOS_MONGO
    process.env.KHRONOS_MONGO = 'mongodb://localhost/khronos-test'
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
    sinon.spy(Container.prototype, 'remove')
    sinon.spy(tasks, 'containers.orphan.prune-dock')
    sinon.spy(tasks, 'containers.orphan.check-against-mongo')
    sinon.spy(tasks, 'containers.remove')
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
    tasks['containers.orphan.prune-dock'].restore()
    tasks['containers.orphan.check-against-mongo'].restore()
    tasks['containers.remove'].restore()
    async.parallel([
      dockerFactory.deleteAllImagesAndContainers.bind(dockerFactory, docker),
      mongodbFactory.removeAllInstances.bind(mongodbFactory)
    ], done)
  })
  after(function () {
    nock.cleanAll()
  })
  after(function (done) {
    process.env.KHRONOS_MONGO = prevMongo
    dockerMockServer.close(done)
  })

  describe('unpopulated dock', function () {
    it('should run successfully', function (done) {
      rabbitmq.publishTask('containers.orphan.prune', {})
      async.doUntil(
        function (cb) { setTimeout(cb, 100) },
        function () {
          return tasks['containers.orphan.prune-dock'].callCount === 1
        },
        function (err) {
          if (err) { return done(err) }
          expect(Container.prototype.remove.callCount).to.equal(0)
          setTimeout(done, 100)
        })
    })
  })

  describe('on a populated dock', function () {
    var containers = []
    beforeEach(function (done) {
      dockerFactory.createRandomContainers(docker, 5, function (err, data) {
        if (err) { return done(err) }
        containers = data
        done()
      })
    })
    beforeEach(function (done) {
      mongodbFactory.createInstanceWithContainers(containers, done)
    })

    it('should run successfully with no orphans', function (done) {
      rabbitmq.publishTask('containers.orphan.prune', {})
      async.doUntil(
        function (cb) { setTimeout(cb, 100) },
        function () {
          var mongoCheckCount =
          tasks['containers.orphan.check-against-mongo'].callCount
          return mongoCheckCount === 5
        },
        function (err) {
          if (err) { return done(err) }
          var pruneDockCount =
          tasks['containers.orphan.prune-dock'].callCount
          expect(pruneDockCount).to.equal(1)
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
    it('should run successfully with orphans', function (done) {
      var rmQuery = { 'container.dockerContainer': containers[0].id }
      async.series([
        function (cb) {
          mongodbFactory.removeInstaceByQuery(rmQuery, cb)
        },
        function (cb) {
          rabbitmq.publishTask('containers.orphan.prune', {})
          async.doUntil(
            function (cb) { setTimeout(cb, 100) },
            function () { return Container.prototype.remove.callCount === 1 },
            function (err) {
              if (err) { return cb(err) }
              expect(tasks['containers.orphan.prune-dock'].calledOnce)
                .to.equal(true)
              expect(tasks['containers.remove'].callCount).to.equal(1)
              expect(Container.prototype.remove.callCount).to.equal(1)
              dockerFactory.listContainersAndAssert(
                docker,
                function (containers) { expect(containers).to.have.length(4) },
                function (err) {
                  if (err) { return done(err) }
                  setTimeout(done, 100)
                })
            })
        }
      ], done)
    })
  })
})
