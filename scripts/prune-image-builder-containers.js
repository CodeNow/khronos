/**
 * Prune image builder containers older than a specified run duration
 * @module scripts/prune-image-builder-containers
 */
'use strict';

var async = require('async');
var find = require('101/find');

var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);
var dockerModule = require('models/docker/docker');
var mavis = require('models/mavis/mavis')();

var IMAGE_BUILDER_REGEX = new RegExp(process.env.KHRONOS_IMAGE_BUILDER_CONTAINER_TAG);

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
      finalCB(err);
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
        docker.getContainers.bind(docker),
        pruneImageBuilderContainers
      ], function () {
        totalContainersCount += docker.containers.length;
        debug.log('completed dock:', dock);
        dockCB();
      });
      function pruneImageBuilderContainers (pruneCB) {
        /**
         * Find + remove containers w/ tags matching docker image builder containers
         */
        var imageBuilderContainers = docker.containers.filter(function (container) {
          return container.RepoTags && find(container.RepoTags, function (tag) {
            return IMAGE_BUILDER_REGEX.test(tag);
          });
        });
        debug.log('Found '+imageBuilderContainers.length+' image-builder containers');
        totalImageBuilderContainersCount += imageBuilderContainers.length;
        async.eachSeries(imageBuilderContainers, function (container, cb) {
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
