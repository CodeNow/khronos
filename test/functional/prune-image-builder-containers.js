/* eslint-disable */
// /**
//  * @module test/prune-image-builder-containers.unit
//  */
// 'use strict';
//
// require('loadenv')('khronos:test');
// require('colors');
//
// var Lab = require('lab');
// var lab = exports.lab = Lab.script();
// var after = lab.after;
// var afterEach = lab.afterEach;
// var before = lab.before;
// var beforeEach = lab.beforeEach;
// var describe = lab.describe;
// var expect = require('chai').expect;
// var it = lab.it;
//
// var Container = require('dockerode/lib/container');
// var async = require('async');
// var dockerFactory = require('../factories/docker');
// var dockerMock = require('docker-mock');
// var mavisMock = require('../mocks/mavis');
// var rewire = require('rewire');
// var sinon = require('sinon');
//
// // set non-default port for testing
// var Docker = require('dockerode');
// var docker = new Docker({
//   host: process.env.KHRONOS_DOCKER_HOST,
//   port: process.env.KHRONOS_DOCKER_PORT
// });
//
// var pruneImageBuilderContainers = rewire('../../scripts/prune-image-builder-containers');
//
// describe('prune-image-builder-containers'.bold.underline.green, function() {
//   var server;
//
//   after(function (done) {
//     Container.prototype.remove.restore();
//     server.close(done);
//   });
//
//   before(function (done) {
//     sinon.spy(Container.prototype, 'remove');
//     server = dockerMock.listen(process.env.KHRONOS_DOCKER_PORT);
//     done();
//   });
//
//   beforeEach(function (done) {
//     mavisMock();
//     done();
//   });
//
//   afterEach(function(done) {
//     async.series([
//       function deleteContainers (cb) {
//         docker.listContainers({all: true}, function (err, containers) {
//           if (err) { throw err; }
//           async.eachSeries(containers, function (container, cb) {
//             docker.getContainer(container.Id).remove(cb);
//           }, cb);
//         });
//       }
//     ], function () {
//       if (Container.prototype.remove.reset) {
//         Container.prototype.remove.reset();
//       }
//       done();
//     });
//   });
//
//   it('should run successfully if no containers on dock', function (done) {
//     pruneImageBuilderContainers(function () {
//       expect(Container.prototype.remove.called).to.equal(false);
//       done();
//     });
//   });
//
//   it('should run successfully if no image builder containers on dock', function (done) {
//     var numContainers = 5;
//     async.series([
//       function createContainers (cb) {
//         dockerFactory.createRandomContainers(docker, numContainers, cb);
//       },
//     ], function () {
//       pruneImageBuilderContainers(function () {
//         docker.listContainers({all: true}, function (err, containers) {
//           if (err) { throw err; }
//           expect(containers.length).to.equal(numContainers);
//           done();
//         });
//       });
//     });
//   });
//
//   it('should only remove image builder containers from dock', function (done) {
//     var numRegularContainers = 5;
//     var numImageBuilderContainers = 2;
//     async.series([
//       function createRegularContainers (cb) {
//         dockerFactory.createRandomContainers(docker, numRegularContainers, cb);
//       },
//       function createImageBuilderContainers (cb) {
//         async.times(numImageBuilderContainers, function (n, cb) {
//           docker.createContainer({
//             Image: 'runnable/image-builder'
//           }, function (err) {
//             if (err) { throw err; }
//             cb();
//           });
//         }, cb);
//       }
//     ], function () {
//       docker.listContainers({all: true}, function (err, containers) {
//         expect(containers.length).to.equal(numRegularContainers+numImageBuilderContainers);
//         pruneImageBuilderContainers(function () {
//           expect(Container.prototype.remove.callCount).to.equal(numImageBuilderContainers);
//           docker.listContainers({all: true}, function (err, containers) {
//             if (err) { throw err; }
//             expect(containers.length).to.equal(numRegularContainers);
//             done();
//           });
//         });
//       });
//     });
//   });
// });
