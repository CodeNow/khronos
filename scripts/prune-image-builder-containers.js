/**
 * Prune image builder containers older than a specified run duration
 * @module scripts/prune-image-builder-containers
 */
'use strict';

var async = require('async');

var datadog = require('models/datadog')(__filename);
var dockerModule = require('models/docker');
var log = require('logger').getChild(__filename);
var mavis = require('models/mavis')();

var IMAGE_BUILDER_REGEX = new RegExp(process.env.KHRONOS_IMAGE_BUILDER_CONTAINER_TAG);
var IMAGE_FILTERS = [
  IMAGE_BUILDER_REGEX
];

module.exports = function(finalCB) {
  log.trace('prune-image-builder-containers start');
  var totalContainersCount = 0;
  var totalImageBuilderContainersCount = 0;
  var successfullyDeletedContainersCount = 0;
  datadog.startTiming('complete-prune-image-builder-containers');
  // for each dock
    // find all containers with tag 'registry.runnable.io'
    // query mongodb instances and if any container is not in db, remove it from dock
  mavis.getDocks(function (err) {
    if (err) {
      log.trace({
        err: err
      }, 'mavis.getDocks error');
      return finalCB(err);
    }
    processOrphanContainers();
  });
  function processOrphanContainers () {
    log.trace('processOrphanContainers');
    async.each(mavis.docks,
    function (dock, dockCB) {
      log.trace({
        dock: dock
      }, 'processOrphanContainers async.each');
      var docker = dockerModule();
      docker.connect(dock);
      async.series([
        docker.getContainers.bind(docker, {
          filters: JSON.stringify({'status': ['exited']})
        }, IMAGE_FILTERS),
        pruneImageBuilderContainers
      ], function (err) {
        if (err) {
          log.error({
            err: err,
            dock: dock
          }, 'processOrphanContainers error');
        }
        totalContainersCount += docker.containers.length;
        log.trace({
          dock: dock
        }, 'processOrphanContainers completed');
        dockCB();
      });
      function pruneImageBuilderContainers (pruneCB) {
        log.trace({
          dockerContainersLength: docker.containers.length
        }, 'pruneImageBuilderContainers');
        totalImageBuilderContainersCount += docker.containers.length;
        async.eachSeries(docker.containers, function (container, cb) {
          docker.removeContainer(container.Id, function (err) {
            if (err) {
              log.error({
                err: err,
                containerId: container.Id
              }, 'pruneImageBuilderContainers docker.removeContainer error');
            }
            else {
              log.trace({
                containerId: container.Id,
                successfullyDeletedContainersCount: successfullyDeletedContainersCount
              }, 'pruneImageBuilderContainers docker.removeContainer success');
            }
            cb();
          });
        }, pruneCB);
      }
    }, function (err) {
      if (err) {
        log.error({
          successfullyDeletedContainersCount: successfullyDeletedContainersCount,
          totalImageBuilderContainersCount: totalImageBuilderContainersCount
        }, 'prune-image-builder-containers complete error');
      }
      else {
        log.trace({
          successfullyDeletedContainersCount: successfullyDeletedContainersCount,
          totalImageBuilderContainersCount: totalImageBuilderContainersCount
        }, 'prune-image-builder-containers complete success');
      }
      datadog.endTiming('complete-prune-image-builder-containers');
      finalCB(err);
    });
  }
};
