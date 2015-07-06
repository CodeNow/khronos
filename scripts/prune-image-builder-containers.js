/**
 * Prune image builder containers older than a specified run duration
 * @module scripts/prune-image-builder-containers
 */
'use strict';

var async = require('async');

var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);
var dockerModule = require('models/docker/docker');
var mavis = require('models/mavis/mavis')();

var IMAGE_BUILDER_REGEX = new RegExp(process.env.KHRONOS_IMAGE_BUILDER_CONTAINER_TAG);
var IMAGE_FILTERS = [
  IMAGE_BUILDER_REGEX
];

module.exports = function(finalCB) {
  var totalContainersCount = 0;
  var totalImageBuilderContainersCount = 0;
  var successfullyDeletedContainersCount = 0;
  datadog.startTiming('complete-prune-image-builder-containers');
  // for each dock
    // find all containers with tag 'registry.runnable.io'
    // query mongodb instances and if any container is not in db, remove it from dock
  mavis.getDocks(function (err) {
    if (err) {
      debug.log(err);
      return finalCB(err);
    }
    processOrphanContainers();
  });
  function processOrphanContainers () {
    async.each(mavis.docks,
    function (dock, dockCB) {
      debug.log('beginning dock:', dock);
      var docker = dockerModule();
      docker.connect(dock);
      async.series([
        docker.getContainers.bind(docker, {
          filters: JSON.stringify({'status': ['exited']})
        }, IMAGE_FILTERS),
        pruneImageBuilderContainers
      ], function () {
        totalContainersCount += docker.containers.length;
        debug.log('completed dock:', dock);
        dockCB();
      });
      function pruneImageBuilderContainers (pruneCB) {
        debug.log('Found '+docker.containers.length+' image-builder containers');
        totalImageBuilderContainersCount += docker.containers.length;
        async.eachSeries(docker.containers, function (container, cb) {
          docker.removeContainer(container.Id, function (err) {
            if (!err) {
              successfullyDeletedContainersCount++;
            }
            cb();
          });
        }, pruneCB);
      }
    }, function (err) {
      debug.log('completed prune-image-builder-containers');
      debug.log('found & removed '+
                successfullyDeletedContainersCount+' image builder containers of '+
                totalImageBuilderContainersCount+' total image builder containers');
      debug.log('-----------------------------------------------------------------------');
      datadog.endTiming('complete-prune-image-builder-containers');
      finalCB(err);
    });
  }
};
