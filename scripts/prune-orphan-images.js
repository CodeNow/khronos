'use strict';

/**
 * Fetch list of images on each dock, verify each image is attached to a context-version in mongodb.
 * Only fetch images with tag indicating image is in our runnable registry.
 * If no associated cv is found, remove image from dock.
 */

var async = require('async');
var equals = require('101/equals');
var findIndex = require('101/find-index');

var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);
var docker = require('models/docker/docker')();
var mavis = require('models/mavis/mavis')();
var mongodb = require('models/mongodb/mongodb')();

module.exports = function(finalCB) {
  var orphanedImagesCount = 0;
  datadog.startTiming('complete-prune-orphan-images');
  // for each dock
    // find all images with tag 'registry.runnable.io'
    // query mongodb context-versions and if any image is not in db, remove it from dock
  async.parallel([
    mongodb.connect.bind(mongodb),
    mavis.getDocks.bind(mavis)
  ], function (err) {
    if (err) {
      return finalCB(err);
    }
    processOrphans();
  });
  function processOrphans () {
    async.eachSeries(mavis.docks,
    function (dock, dockCB) {
      debug.log('dock', dock);
      docker.connect(dock);
      async.series([
        docker.getImages.bind(docker),
        fetchContextVersions
      ], function () {
        debug.log('completed dock:', dock);
        dockCB();
      });
      function fetchContextVersions (fetchCVCB) {
        // chunk check context versions in db for batch of 100 images
        var chunkSize = 100;
        var lowerBound = 0;
        var upperBound = Math.min(chunkSize, docker.images.length);
        var imageTagSet = [];
        if (docker.images.length) { imageTagSet = docker.images.slice(lowerBound, upperBound); }
        /**
         * Chunk requests to mongodb to avoid potential memory/heap size issues
         * when working with large numbers of images and context-version documents
         */
        async.doWhilst(
          doWhilstIterator,
          function check () {
            lowerBound = upperBound;
            upperBound = Math.min(upperBound+chunkSize, docker.images.length);
            imageTagSet = docker.images.slice(lowerBound, upperBound);
            return imageTagSet.length;
          },
          fetchCVCB
        );
        function doWhilstIterator (doWhilstIteratorCB) {
          debug.log('fetching context-versions '+lowerBound+' - '+upperBound);
          /**
           * construct query of context-version ids by iterating over each image
           * and producting an array of ObjectID's for their corresponding
           * context-versions
           */
          var regexImageTagCV =
            new RegExp('^'+process.env.KHRONOS_DOCKER_REGISTRY+'\/[0-9]+\/([A-z0-9]+):([A-z0-9]+)');
          var cvIds = imageTagSet.map(function (imageTag) {
            // regexExecResult =
            //   registry.runnable.io/<session-user>:<context-version-Id> [2] is
            //   "<context-version-Id>"
            var regexExecResult = regexImageTagCV.exec(imageTag);
            return mongodb.newObjectID(regexExecResult[2]);
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
            async.eachLimit(imageTagSet,
              process.env.KHRONOS_DELETE_CONCURRENCY_LIMIT,
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
                      'failed to remove image: '+imageTag+' on dock: '+dock.host, docker.dock);
                    debug.log(err);
                  }
                  else {
                    debug.log('removed image: '+imageTag+' on dock: '+dock.host, docker.dock);
                  }
                  eachCB();
                });
            }, doWhilstIteratorCB);
          });
        }
      }
    }, function (err) {
      debug.log('done');
      debug.log('found & removed '+orphanedImagesCount+' orphaned images');
      datadog.endTiming('complete-prune-orphan-images');
      finalCB(err);
    });
  }
};
