'use strict';

/**
 * Fetch list of images on each dock, verify each image is attached to a context-version in mongodb.
 * Only fetch images with tag indicating image is in our runnable registry.
 * If no associated cv is found, remove image from dock.
 */

//var Docker = require('dockerode');
var async = require('async');
var equals = require('101/equals');
var findIndex = require('101/find-index');
var isFunction = require('101/is-function');
var noop = require('101/noop');

var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);
var docker = require('models/docker/docker')();
var mavis = require('models/mavis/mavis')();
var mongodb = require('models/mongodb/mongodb')();

module.exports = function(finalCB) {
  var orphanedImagesCount = 0;
  var regexImageTagCV = new RegExp('^'+process.env.KHRONOS_DOCKER_REGISTRY+'\/[0-9]+\/([A-z0-9]+):([A-z0-9]+)');
  if (!isFunction(finalCB)) {
    finalCB = noop;
  }
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
            debug.log('fetching context-versions ' + lowerBound + ' - ' + upperBound);
            mongodb.fetchContextVersionsForImages(imageSet, function (err, contextVersions) {
              if (err) { return doWhilstIteratorCB(err); }
              var numberMissing = (upperBound - lowerBound) - contextVersions.length;
              if (!numberMissing) {
                debug.log('all images in set '+lowerBound+'-'+upperBound+' found, proceeding...');
                return doWhilstIteratorCB();
              }
              debug.log(numberMissing + ' images on box not in database, cleaning up...');
              orphanedImagesCount += numberMissing;
              var foundCvIDs = contextVersions.map(function (res) {
                return res['_id'].toString();
              });
              // figure out which images in imageSet do not have corresponding context-versions
              async.forEach(imageSet,
                function (image, eachCB) {
                  var imageCVIDEqualsFn = equals(regexImageTagCV.exec(image.RepoTags[0])[2]);
                  if (-1 !== findIndex(foundCvIDs, imageCVIDEqualsFn)) {
                    // image has corresponding cv, continue
                    return eachCB();
                  }
                  debug.log('cv not found for image: ' + image.Id);
                  docker.removeImage(image.Id, function (err) {
                    if (err) {
                      debug.log('failed to remove image: '+image.Id+ ' on dock: '+dock.host);
                      debug.log(err);
                    }
                    eachCB();
                  });
              }, doWhilstIteratorCB);
            });
          }
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
      debug.log('found ' + orphanedImagesCount + ' orphaned images');
      datadog.endTiming('complete-prune-orphan-images');
      finalCB(err);
    });
  }
};
