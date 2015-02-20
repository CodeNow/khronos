/**
 * Prune containers from each dock if no corresponding instance document exisits
 * @module scripts/prune-orphan-containers
 */
use strict';

var async = require('async');
var equals = require('101/equals');
var findIndex = require('101/find-index');

var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);
var dockerModule = require('models/docker/docker');
var mavis = require('models/mavis/mavis')();
var mongodb = require('models/mongodb/mongodb');

module.exports = function(finalCB) {
  var orphanedContainersCount = 0;
  datadog.startTiming('complete-prune-orphan-containers');
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
        fetchInstancesAndPrune
      ], function () {
        debug.log('completed dock:', dock);
        dockCB();
      });
      function fetchInstancesAndPrune (fetchCVCB) {
        // chunk check context versions in db for batch of 100 images
        var chunkSize = 100;
        var lowerBound = 0;
        var upperBound = Math.min(chunkSize, docker.images.length);
        var containerSet = [];
        if (docker.containers.length) { containerSet = docker.containers.slice(lowerBound, upperBound); }
        /**
         * Chunk requests to mongodb to avoid potential memory/heap size issues
         * when working with large numbers of containers and instance documents
         */
        async.doWhilst(
          doWhilstIterator,
          function check () {
            lowerBound = upperBound;
            upperBound = Math.min(upperBound+chunkSize, docker.containers.length);
            containerSet = docker.containers.slice(lowerBound, upperBound);
            return containerSet.length;
          },
          fetchCVCB
        );
        function doWhilstIterator (doWhilstIteratorCB) {
          debug.log('fetching instances '+lowerBound+' - '+upperBound);
          /**
           * construct query for instances by iterating over each container
           */
          var query = {
            contextVersion: {
              containerId: {
                '$in': containerSet.map(pluck('Id'))
              }
            }
          };
          mongodb.fetchInstances(query, function (err, instances) {
            if (err) { return doWhilstIteratorCB(err); }
            /**
             * The difference between the range (upperBound-lowerBound) and the number
             * of instances that were retrieved is the number of orphaned containers
             * that have just been discovered on the current dock.
             */
            var numberMissing = (upperBound - lowerBound) - instances.length;
            if (!numberMissing) {
              debug.log('all containers in set '+lowerBound+'-'+upperBound+' found, proceeding...');
              return doWhilstIteratorCB();
            }
            debug.log(numberMissing+' containers on box not in database, cleaning up...');
            // track total number of orphaned containers that were discovered in this cron iteration
            orphanedContainersCount += numberMissing;
            /**
             * determine which containers in containerSet do not have corresponding instances
             * by iterating over each container in containerSet, and searching through the retrieved
             * instance documents for a match. If no match found, this container is an
             * orphan.
             */
            var foundInstancesContainerIds = instances.map(pluck('contextVersion.containerId')):
            async.eachSeries(containerSet,
            function (container, eachCB) {
              // have container, is it in the list of "foundInstancesContainerIds" ????
              if (-1 !== findIndex(foundInstancesContainerIds, equals(container.Id))) {
                // container has corresponding Instance, continue (not orphan)
                return eachCB();
              }
              debug.log('Instance not found for container: '+container.Id);
              // orphan found
              // see if image has any running containers & remove if so
              var results = docker.containers.filter(function (container) {
                return container.Image === imageTag;
              });
              if (results.length) {
                // first remove containers...
                orphanedContainersCount += results.length;
                debug.log('Found '+results.length+
                          ' containers with base image: '+imageTag+'. Cleaning up...');
                async.eachLimit(results, 1, function  (container, cb) {
                  docker.removeContainer(container.Id, cb);
                }, function (err) {
                  if (err) { debug.log(err); }
                  removeImage(imageTag, eachCB);
                });
              }
              else {
                removeImage(imageTag, eachCB);
              }
            }, doWhilstIteratorCB);
          });
        }
        function removeImage(imageTag, cb) {
          docker.removeImage(imageTag, function (err) {
            if (err) {
              debug.log(
                'failed to remove image: '+imageTag+' on dock: '+dock);
              debug.log(err);
            }
            else {
              debug.log('removed image: '+imageTag+' on dock: '+dock);
            }
            cb();
          });
        }
      }
    }, function (err) {
      debug.log('completed prune-orphan-images-and-containers');
      debug.log('found & removed '+orphanedImagesCount+' orphaned images');
      debug.log('found & removed '+orphanedContainersCount+' orphaned containers');
      datadog.endTiming('complete-prune-orphan-images');
      finalCB(err);
    });
  }
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
