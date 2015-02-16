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
    async.forEach(mavis.docks,
    function (dock, dockCB) {
      docker.connect(dock);
      async.series([
        docker.getImages.bind(docker),
        function fetchContextVersions (fetchCVCB) {
          // chunk check context versions in db for batch of 100 images
          var chunkSize = 100;
          var lowerBound = 0;
          var upperBound = Math.min(chunkSize, docker.images.length);
          var imageSet = [];
          if (docker.images.length) { imageSet = docker.images.slice(lowerBound, upperBound); }
          function doWhilstIterator (doWhilstIteratorCB) {
            debug.log('fetching context-versions '+lowerBound+' - '+upperBound);
            /**
             * construct query of context-version ids by iterating over each image
             * and producting an array of ObjectID's for their corresponding
             * context-versions
             */
            var regexImageTagCV = new RegExp('^'+process.env.KHRONOS_DOCKER_REGISTRY+'\/[0-9]+\/([A-z0-9]+):([A-z0-9]+)');
            var cvIds = imageSet.map(function (image) {
              var regexExecResult = regexImageTagCV.exec(image);
              return mongodb.newObjectID(regexExecResult[2]);
            });
            var query = {
              '_id': {
                '$in': cvIds
              }
            };
            mongodb.fetchContextVersions(query, function (err, contextVersions) {
              if (err) {
                debug.log('error fetching context versions', query, err);
                return doWhilstIteratorCB(err);
              }
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
               * determine which images in imageSet do not have corresponding context-versions
               * by iterating over each image in imageSet, and searching through the retrieved
               * context-version documents for a match. If no match found, this image is an
               * orphan.
               */
              async.forEach(imageSet,
                function (image, eachCB) {
                  var imageCVIDEqualsFn = equals(regexImageTagCV.exec(image.RepoTags[0])[2]);
                  if (-1 !== findIndex(foundCvIDs, imageCVIDEqualsFn)) {
                    // image has corresponding cv, continue (not orphan)
                    return eachCB();
                  }
                  debug.log('cv not found for image: '+image.Id);
                  // orphan found
                  docker.removeImage(image.Id, function (err) {
                    if (err) {
                      debug.log('failed to remove image: '+image.Id+' on dock: '+dock.host);
                      debug.log(err);
                    }
                    eachCB();
                  });
              }, doWhilstIteratorCB);
            });
          }
          /**
           * Chunk requests to mongodb to avoid potential memory/heap size issues
           * when working with large numbers of images and context-version documents
           */
          async.doWhilst(
            doWhilstIterator,
            function check () {
              lowerBound = upperBound;
              upperBound = Math.min(upperBound+chunkSize, docker.images.length);
              imageSet = docker.images.slice(lowerBound, upperBound);
              return imageSet.length;
            },
            fetchCVCB
          );
        }
      ], dockCB);
    }, function (err) {
      debug.log('done');
      debug.log('found '+orphanedImagesCount+' orphaned images');
      datadog.endTiming('complete-prune-orphan-images');
      finalCB(err);
    });
  }
};
