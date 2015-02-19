/**
 * Prune images from each dock if no corresponding context-version document
 * in database
 * @module scripts/prune-orphan-containers
 */
'use strict';

/**
 * Prunes containers running/dead > 12 hours
 * from image "docker-image-builder"
 */
var async = require('async');

var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);
var dockerModule = require('models/docker/docker');
var mavis = require('models/mavis/mavis')();
var mongodb = require('models/mongodb/mongodb')();

module.exports = function(finalCB) {
  var orphanedContainersCount = 0;
  var rootTimingKey = 'complete-prune-orphan-containers';
  datadog.startTiming(rootTimingKey);
  async.parallel([
    mongodb.connect.bind(mongodb),
    mavis.getDocks.bind(mavis)
  ], function (err) {
    if (err) {
      return finalCB(err);
    }
    processOrphanContainers();
  });
  function processOrphanContainers () {
    async.each(mavis.docks,
    function (dock, dockCB) {
      debug.log('beginning dock:', dock);
    },
    function () {
      mongodb.close(true, function (err) {
        if (err) {
        }
      });
    });
  }

/*
  var docks = Object.keys(process.env)
    .filter(function (env) {
      return /^DOCK_HOST_/.test(env);
    });
  async.forEach(docks, function (dock) {
    console.log('connecting to docker daemon');
    var host = process.env[dock].split(':')[0];
    var port = process.env[dock].split(':')[1];
    var docker = new Docker({host:host, port:port});
    console.log('fetching containers');
    docker.listContainers({all: true}, function (err, containers) {
      var currentTime = Math.floor(Date.now() / 1000); // convert nanoseconds to seconds
      var deleteContainerStartedBeforeTime = currentTime - process.env.MAX_CONTAINER_LIVE_TIME;
      var containersToDelete = containers.filter(function(container) {
        return container.Created < deleteContainerStartedBeforeTime &&
               container.Image === 'docker-image-builder';
      });
      console.log('found ' + containersToDelete.length + ' containers');
      async.each(containersToDelete, function(containerObj, cb){
        var container = docker.getContainer(containerObj.Id);
        container.stop(function() {
          container.remove(function() {
            cb();
          });
        });
      }, function(err, results) {
        console.log(containersToDelete.length + ' containers deleted');
        cb();
      });
    });
  }, function () {
    console.log('prune-containers processed: ' + docks.length);
  });
*/
};
