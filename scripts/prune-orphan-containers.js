/**
 * Prune images from each dock if no corresponding context-version document
 * in database
 * @module scripts/prune-orphan-containers
 */
'use strict';

var async = require('async');

var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);
var dockerModule = require('models/docker/docker');
var mavis = require('models/mavis/mavis')();
var mongodb = require('models/mongodb/mongodb');

module.exports = function(finalCB) {
  var orphanedContainersCount = 0;
  var rootTimingKey = 'complete-prune-orphan-containers';
  datadog.startTiming(rootTimingKey);
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
        docker.getContainers.bind(docker),
        fetchContextVersions
      ], function () {
        debug.log('completed dock': dock);
        dockCB();
      });
      function fetchContextVersions (fetchCVCB) {
        console.log('containers', docker.containers);
        // chunk check context versions in db for batch of 100 images
        var chunkSize = 100;
        var lowerBound = 0;
        var upperBound = Math.min(chunkSize, docker.images.length);
        var containerTagSet = [];
        if (docker.containers.length) { containerTagSet = docker.containers.slice(lowerBound, upperBound); }
        /**
         * Chunk requests to mongodb to avoid potential memory/heap size issues
         * when working with large numbers of containers and context-version documents
         */
        async.doWhilst(
          doWhilstIterator,
          function check () {
            lowerBound = upperBound;
            upperBound = Math.min(upperBound+chunkSize, docker.containers.length);
            containerTagSet = docker.containers.slice(lowerBound, upperBound);
            return containerTagSet.length;
          },
          fetchCVCB
        );
        function doWhilstIterator (doWhilstIteratorCB) {
          debug.log('fetching context-versions '+lowerBound+' - '+upperBound);
          /**
           * construct query of context-version ids by iterating over each image
           * and producting an array of ObjectID's for images' corresponding
           * context-versions
           */
          var regexImageTagCV =
            new RegExp('^'+process.env.KHRONOS_DOCKER_REGISTRY+'\/[0-9]+\/([A-z0-9]+):([A-z0-9]+)');
          var cvIds = containerTagSet.map(function (containerTag) {
            // regexExecResult =
            //   registry.runnable.io/<session-user>:<context-version-Id> [2] is
            //   "<context-version-Id>"
            //var regexExecResult = regexImageTagCV.exec(imageTag);
            //return mongodb.newObjectID(regexExecResult[2]);
            return containerTag;
          });
          var query = {
            '_id': {
              '$in': cvIds
            }
          };
          mongodb.fetchContextVersions(query, function (err, contextVersions) {
            if (err) { return doWhilstIteratorCB(err); }
            /**
             * The difference between the range (upperBound-lowerBound) and the number
             * of contextVersions that were retrieved is the number of orphaned images
             * that have just been discovered on the current dock.
             */
            var numberMissing = (upperBound - lowerBound) - contextVersions.length;
            if (!numberMissing) {
              debug.log('all images in set '+lowerBound+'-'+upperBound+' found, proceeding...');
              return doWhilstIteratorCB();
            }
            debug.log(numberMissing+' images on box not in database, cleaning up...');
            // track total number of orphaned images that were discovered in this cron iteration
            orphanedImagesCount += numberMissing;
            // need array of mongids in string format to perform search
            var foundCvIDs = contextVersions.map(function (res) {
              return res._id.toString();
            });
            /**
             * determine which images in imageTagSet do not have corresponding context-versions
             * by iterating over each image in imageTagSet, and searching through the retrieved
             * context-version documents for a match. If no match found, this image is an
             * orphan.
             */
            async.eachSeries(imageTagSet,
              function (imageTag, eachCB) {
                // registry.runnable.io/<session-user>:<context-version-Id> [2] is
                //   "<context-version-Id>"
                var imageCVIDEqualsFn = equals(regexImageTagCV.exec(imageTag)[2]);
                if (-1 !== findIndex(foundCvIDs, imageCVIDEqualsFn)) {
                  // image has corresponding cv, continue (not orphan)
                  return eachCB();
                }
                debug.log('cv not found for image: '+imageTag);
                // orphan found
                docker.removeImage(imageTag, function (err) {
                  if (err) {
                    debug.log(
                      'failed to remove image: '+imageTag+' on dock: '+dock);
                    debug.log(err);
                  }
                  else {
                    debug.log('removed image: '+imageTag+' on dock: '+dock);
                  }
                  eachCB();
                });
            }, doWhilstIteratorCB);
          });
        }
      }




    },
    function (err) {
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
