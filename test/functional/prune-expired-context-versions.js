'use strict'

require('loadenv')({ debugName: 'khronos:test' })

// external
const async = require('async')
const chai = require('chai')
const find = require('101/find')
const hasKeypaths = require('101/has-keypaths')
const rabbitmq = require('models/rabbitmq')
const pluck = require('101/pluck')
const ponos = require('ponos')
const sinon = require('sinon')

// internal
const mongodb = require('models/mongodb')
const mongodbFactory = require('../factories/mongodb')

chai.use(require('chai-as-promised'))
const assert = chai.assert

describe('Prune Expired Context Versions', function () {
  var tasks = {
    'context-versions.prune-expired': require('tasks/context-versions/prune-expired'),
    'context-versions.check-recent-usage': require('tasks/context-versions/check-recent-usage'),
    'context-versions.remove-and-protect-instances': require('tasks/context-versions/remove-and-protect-instances')
  }
  var workerServer
  beforeEach(function () {
    sinon.spy(tasks, 'context-versions.prune-expired')
    sinon.spy(tasks, 'context-versions.check-recent-usage')
    sinon.spy(tasks, 'context-versions.remove-and-protect-instances')
    const opts = {
      name: process.env.APP_NAME,
      hostname: process.env.RABBITMQ_HOSTNAME,
      port: process.env.RABBITMQ_PORT,
      username: process.env.RABBITMQ_USERNAME || 'guest',
      password: process.env.RABBITMQ_PASSWORD || 'guest',
      tasks: tasks
    }
    workerServer = new ponos.Server(opts)
    return rabbitmq.connect().then(workerServer.start.bind(workerServer))
  })
  afterEach(function () {
    return assert.isFulfilled(Promise.all([rabbitmq.disconnect(), workerServer.stop()]))
  })
  afterEach(function () {
    tasks['context-versions.prune-expired'].restore()
    tasks['context-versions.check-recent-usage'].restore()
    tasks['context-versions.remove-and-protect-instances'].restore()
  })
  afterEach(function (done) {
    async.parallel([
      mongodbFactory.removeAllContextVersions,
      mongodbFactory.removeAllInstances,
      mongodbFactory.removeAllBuilds
    ], done)
  })

  describe('with no context version to prune', function () {
    it('should run successfully', function (done) {
      rabbitmq.publishTask('context-versions.prune-expired', {})
      async.until(
        function () {
          return tasks['context-versions.prune-expired'].callCount === 1
        },
        function (cb) { setTimeout(cb, 100) },
        function (err) {
          if (err) { return done(err) }
          sinon.assert.notCalled(tasks['context-versions.check-recent-usage'])
          sinon.assert.notCalled(tasks['context-versions.remove-and-protect-instances'])
          done()
        })
    })
  })

  describe('with context versions', function () {
    beforeEach(function (done) {
      var contextVersions = [{
        build: {
          started: new Date(),
          completed: true,
          dockerTag: '1234'
        }
      }]
      async.series([
        function (cb) { mongodbFactory.createContextVersions(contextVersions, cb) }
      ], done)
    })

    it('should not remove current context versions', function (done) {
      rabbitmq.publishTask('context-versions.prune-expired', {})
      async.doUntil(
        function (cb) { setTimeout(cb, 100) },
        function () {
          return tasks['context-versions.prune-expired'].callCount === 1
        },
        function (err) {
          if (err) { return done(err) }
          sinon.assert.notCalled(tasks['context-versions.check-recent-usage'])
          setTimeout(done, 100)
        })
    })

    describe('with context versions to remove', function () {
      var longTimeAgo
      beforeEach(function (done) {
        longTimeAgo = new Date()
        longTimeAgo.setDate((new Date()).getDate() - 10)
        var contextVersions = [{
          build: {
            started: longTimeAgo,
            completed: true,
            dockerTag: '1234'
          }
        }]
        async.series([
          function (cb) { mongodbFactory.createContextVersions(contextVersions, cb) }
        ], done)
      })

      it('should remove old context versions (not attached to anything)', function (done) {
        rabbitmq.publishTask('context-versions.prune-expired', {})
        async.doUntil(
          function (cb) { setTimeout(cb, 100) },
          function () {
            return tasks['context-versions.remove-and-protect-instances'].calledOnce
          },
          function (err) {
            if (err) { return done(err) }
            mongodbFactory.getContextVersions(function (err, cvs) {
              if (err) { return done(err) }
              assert.lengthOf(cvs, 1)
              sinon.assert.calledOnce(tasks['context-versions.check-recent-usage'])
              sinon.assert.calledOnce(tasks['context-versions.remove-and-protect-instances'])
              setTimeout(done, 100)
            })
          })
      })

      describe('with old context versions that are attached to instances', function () {
        var longTimeAgo, savedContextVersion
        beforeEach(function (done) {
          longTimeAgo = new Date()
          longTimeAgo.setDate((new Date()).getDate() - 10)
          var contextVersions = [{
            build: {
              started: longTimeAgo,
              completed: true,
              dockerTag: '5678'
            }
          }]
          async.series([
            function (cb) { mongodbFactory.createContextVersions(contextVersions, cb) },
            function (cb) {
              mongodbFactory.getContextVersions(function (err, cvs) {
                if (err) { return done(err) }
                savedContextVersion = find(cvs, hasKeypaths({ 'build.dockerTag': '5678' }))
                mongodbFactory.createInstance({
                  contextVersion: { _id: savedContextVersion._id } // _id must be an ObjectID
                }, cb)
              })
            }
          ], done)
        })

        it('should not delete them', function (done) {
          rabbitmq.publishTask('context-versions.prune-expired', {})
          async.doUntil(
            function (cb) { setTimeout(cb, 100) },
            function () {
              return tasks['context-versions.remove-and-protect-instances'].calledOnce
            },
            function (err) {
              if (err) { return done(err) }
              mongodbFactory.getContextVersions(function (err, cvs) {
                if (err) { return done(err) }
                assert.lengthOf(cvs, 2)
                assert.include(cvs.map(pluck('_id.toString()')), '' + savedContextVersion._id)
                sinon.assert.calledTwice(tasks['context-versions.check-recent-usage'])
                sinon.assert.calledOnce(tasks['context-versions.remove-and-protect-instances'])
                setTimeout(done, 100)
              })
            })
        })
      })

      describe('with old context versions that are on recent builds', function () {
        var longTimeAgo, savedContextVersion
        beforeEach(function (done) {
          longTimeAgo = new Date()
          longTimeAgo.setDate((new Date()).getDate() - 10)
          var contextVersions = [{
            build: {
              started: longTimeAgo,
              completed: true,
              dockerTag: '5678'
            }
          }]
          async.series([
            function (cb) { mongodbFactory.createContextVersions(contextVersions, cb) },
            function (cb) {
              mongodbFactory.getContextVersions(function (err, cvs) {
                if (err) { return done(err) }
                savedContextVersion = find(cvs, hasKeypaths({ 'build.dockerTag': '5678' }))
                var buildData = {
                  build: { created: new Date() },
                  contextVersions: [ '' + savedContextVersion._id ] // gets transformed into ObjectIDs
                }
                mongodbFactory.createBuild(buildData, cb)
              })
            }
          ], done)
        })

        it('should not delete them', function (done) {
          rabbitmq.publishTask('context-versions.prune-expired', {})
          async.doUntil(
            function (cb) { setTimeout(cb, 100) },
            function () {
              return tasks['context-versions.remove-and-protect-instances'].calledOnce
            },
            function (err) {
              if (err) { return done(err) }
              mongodbFactory.getContextVersions(function (err, cvs) {
                if (err) { return done(err) }
                assert.lengthOf(cvs, 2)
                assert.include(cvs.map(pluck('_id.toString()')), '' + savedContextVersion._id)
                sinon.assert.calledTwice(tasks['context-versions.check-recent-usage'])
                sinon.assert.calledOnce(tasks['context-versions.remove-and-protect-instances'])
                setTimeout(done, 100)
              })
            })
        })
      })

      describe('with old context versions are put back on an instance after removed', function () {
        var longTimeAgo, savedContextVersion
        beforeEach(function (done) {
          longTimeAgo = new Date()
          longTimeAgo.setDate((new Date()).getDate() - 10)
          var contextVersions = [{
            build: {
              started: longTimeAgo,
              completed: true,
              dockerTag: '5678'
            }
          }]
          async.series([
            function (cb) { mongodbFactory.createContextVersions(contextVersions, cb) },
            function (cb) {
              mongodbFactory.getContextVersions(function (err, cvs) {
                if (err) { return done(err) }
                savedContextVersion = find(cvs, hasKeypaths({ 'build.dockerTag': '5678' }))
                cb()
              })
            }
          ], done)
        })
        beforeEach(function () {
          // on the second time we call countInstance, I am simply going to fake
          // that there is now a mongo instance that exists, so that we can test
          // the functionality
          sinon.spy(mongodb.prototype, 'insertContextVersions')
          sinon.stub(mongodb.prototype, 'countInstances').yieldsAsync(null, 0)
          mongodb.prototype.countInstances.withArgs({
            'contextVersion._id': savedContextVersion._id
          }).yieldsAsync(null, 1)
        })
        afterEach(function () {
          mongodb.prototype.countInstances.restore()
          mongodb.prototype.insertContextVersions.restore()
        })

        it('should not delete them', function (done) {
          rabbitmq.publishTask('context-versions.prune-expired', {})
          async.doUntil(
            function (cb) { setTimeout(cb, 100) },
            function () {
              return tasks['context-versions.remove-and-protect-instances'].calledTwice &&
                mongodb.prototype.countInstances.callCount === 4 &&
                mongodb.prototype.insertContextVersions.calledOnce
            },
            function (err) {
              if (err) { return done(err) }
              mongodbFactory.getContextVersions(function (err, cvs) {
                if (err) { return done(err) }
                assert.lengthOf(cvs, 2)
                assert.include(cvs.map(pluck('_id.toString()')), '' + savedContextVersion._id)
                sinon.assert.calledTwice(tasks['context-versions.check-recent-usage'])
                sinon.assert.calledTwice(tasks['context-versions.remove-and-protect-instances'])
                sinon.assert.calledOnce(mongodb.prototype.insertContextVersions)
                setTimeout(done, 100)
              })
            })
        })
      })
    })
  })
})
