/* eslint-disable */
/**
 * Fetch list of images on each dock, verify each image is attached to a context-version in mongodb.
 * Only fetch images with tag indicating image is in our runnable registry.
 * If no associated cv is found, remove image from dock.
 *
 * 05/13 - expanding functionality to prune images with base image name <none>
 * @module scripts/prune-orphan-images
 */
'use strict';

var async = require('async');
var equals = require('101/equals');
var findIndex = require('101/find-index');

var datadog = require('models/datadog')(__filename);
var Docker = require('models/docker');
var log = require('logger').getChild(__filename);
var Mavis = require('models/mavis');
var mongodb = require('models/mongodb');

module.exports = function(finalCb) {
  log.info('prune-orphan-images start');
  var mavis = new Mavis();
  var orphanedImagesCount = 0;
  var totalImagesCount = 0;
  datadog.startTiming('complete-prune-orphan-images');
  // for each dock
    // find all images with tag 'registry.runnable.io'
    // query mongodb context-versions and if any image is not in db, remove it from dock
  async.waterfall([
    mavis.getDocks.bind(mavis),
    processOrphans
  ], finalCb);

  function processOrphans (docks, cb) {
    log.trace('processOrphans');
    async.each(
      docks,
      function (dock, dockCB) {
        log.trace({ dock: dock }, 'processOrphans async.each');
        var docker = new Docker(dock);
        var maxImageAge = parseInt(process.env.KHRONOS_MIN_IMAGE_AGE);
        async.waterfall([
          docker.getImages.bind(docker, maxImageAge),
          function (images, taglessImages, cb) {
            deleteTaglessImages(taglessImages, function (err) {
              cb(err, images);
            });
          },
          fetchContextVersionsAndPrune
        ], function (err) {
          if (err) {
            log.error({
              err: err,
              dock: dock
            }, 'processOrphans complete error');
            return dockCB(err);
          }
          log.trace({ dock: dock }, 'processOrphans complete success');
          dockCB();
        });
        /**
         * Delete images from docks that do not have tags
         */
        function deleteTaglessImages (taglessImages, cb) {
          log.trace({
            taglessImagesCount: taglessImages.count,
            dock: dock
          }, 'deleteTaglessImages');
          // increase concurrency carefully, avoid overloading dockerd
          async.eachLimit(taglessImages, 2, function (image, eachCb) {
            log.trace({
              imageId: image.Id,
              repoTags: image.RepoTags,
              taglessImagesCount: taglessImages,
              dock: dock
            }, 'deleteTaglessImages pre docker.removeImage');
            docker.removeImage(image.Id, function (err) {
              if (err) {
                log.error({
                  err: err,
                  imageId: image.Id,
                  repoTags: image.RepoTags,
                  taglessImagesCount: taglessImages,
                  dock: dock
                }, 'deleteTaglessImages docker.removeImage complete error');
                return eachCb(err);
              }
              log.trace({
                imageId: image.Id,
                repoTags: image.RepoTags,
                taglessImagesCount: taglessImages,
                dock: dock
              }, 'deleteTaglessImages docker.removeImage complete success');
              eachCb();
            });
          }, cb);
        }
        function fetchContextVersionsAndPrune (images, fetchCVCB) {
          log.trace({ dock: dock }, 'fetchContextVersionsAndPrune');
          // chunk check context versions in db for batch of 100 images
          var chunkSize = 100;
          var lowerBound = 0;
          var upperBound = Math.min(chunkSize, images.length);
          var imageTagSet = [];
          if (images.length) { imageTagSet = images.slice(lowerBound, upperBound); }
          /**
           * Chunk requests to mongodb to avoid potential memory/heap size issues
           * when working with large numbers of images and context-version documents
           */
          async.doWhilst(
            doWhilstIterator,
            function check () {
              lowerBound = upperBound;
              upperBound = Math.min(upperBound+chunkSize, images.length);
              imageTagSet = images.slice(lowerBound, upperBound);
              return imageTagSet.length;
            },
            fetchCVCB
          );
          function doWhilstIterator (doWhilstIteratorCB) {
            log.trace({
              dock: dock,
              lowerBound: lowerBound,
              upperBound: upperBound,
              imageTagSetLength: imageTagSet.length
            }, 'fetchContextVersionsAndPrune doWhilstIterator');
            /**
             * construct query of context-version ids by iterating over each image
             * and producting an array of ObjectID's for images' corresponding
             * context-versions
             */
            var regexImageTagCV = new RegExp('^' + process.env.KHRONOS_DOCKER_REGISTRY +
              '\/[0-9]+\/([A-z0-9]+):([A-z0-9]+)');
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
            log.trace({
              dock: dock,
              query: query
            }, 'fetchContextVersionsAndPrune doWhilstIterator '+
              'mongodb.fetchContextVersions pre-query');
            mongodb.fetchContextVersions(query, function (err, contextVersions) {
              if (err) {
                log.error({
                  err: err,
                  dock: dock,
                  query: query
                }, 'fetchContextVersionsAndPrune doWhilstIterator '+
                  'mongodb.fetchContextVersions error');
                return doWhilstIteratorCB(err);
              }
              else {
                log.trace({
                  contextVersionsLength: contextVersions.length,
                  dock: dock,
                  query: query
                }, 'fetchContextVersionsAndPrune doWhilstIterator '+
                  'mongodb.fetchContextVersions success');
              }
              /**
               * The difference between the range (upperBound-lowerBound) and the number
               * of contextVersions that were retrieved is the number of orphaned images
               * that have just been discovered on the current dock.
               */
              var numberMissing = (upperBound - lowerBound) - contextVersions.length;
              if (!numberMissing) {
                log.trace({
                  numberMissing: numberMissing,
                  upperBound: upperBound,
                  lowerBound: lowerBound,
                  contextVersionsLength: contextVersions.length,
                  dock: dock
                }, 'doWhilstIterator: no missing context-versions in set');
                return doWhilstIteratorCB();
              }
              log.trace({
                numberMissing: numberMissing,
                upperBound: upperBound,
                lowerBound: lowerBound,
                contextVersionsLength: contextVersions.length,
                dock: dock
              }, 'doWhilstIterator: found missing context-versions in set');
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
                log.trace({
                  imageTag: imageTag
                }, 'cv not found for image');
                removeImage(imageTag, eachCB);
              }, doWhilstIteratorCB);
            });
          }
          function removeImage(imageTag, cb) {
            log.trace({
              imageTag: imageTag,
              dock: dock
            }, 'removeImage');
            docker.removeImage(imageTag, function (err) {
              if (err) {
                log.error({
                  err: err,
                  imageTag: imageTag,
                  dock: dock
                }, 'removeImage error');
              }
              else {
                log.trace({
                  err: err,
                  imageTag: imageTag,
                  dock: dock
                }, 'removeImage success');
              }
              cb();
            });
          }
        }
      }, function (err) {
        if (err) {
          log.error({
            err: err,
            orphanedImagesCount: orphanedImagesCount,
            totalImagesCount: totalImagesCount
          }, 'prune-orphan-images complete error');
        }
        else {
          log.info({
            orphanedImagesCount: orphanedImagesCount,
            totalImagesCount: totalImagesCount
          }, 'prune-orphan-images complete success');
        }
        datadog.endTiming('complete-prune-orphan-images');
        cb(err);
      });
  }
};
