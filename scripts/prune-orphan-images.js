  'use strict';

  /**
   * Fetch list of images on each dock, verify each image is attached to a context-version in mongodb.
   * Only fetch images with tag indicating image is in our runnable registry.
   * If no associated cv is found, remove image from dock.
   */

  var Docker = require('dockerode');
  var MongoClient = require('mongodb').MongoClient;
  var ObjectID = require('mongodb').ObjectID;
  var async = require('async');
  var equals = require('101/equals');
  var findIndex = require('101/find-index');
  var isFunction = require('101/is-function');
  var noop = require('101/noop');
  var request = require('request');
  var stats = new require('models/datadog')('prune-orphan-images');

  module.exports = function(finalCB) {

    if (!isFunction(finalCB)) {
      finalCB = noop;
    }

    // for datadog statsd timing
    var startPrune = new Date();

    // for each dock
      // find all images with tag 'registry.runnable.io'
      // query mongodb context-versions and if any image is not in db, remove it from dock

    var activeDocks;
    var db;
    var images;

    var orphanedImages = 0;
    var initializationFunctions = [connectToMongoDB];

    if (process.env.KHRONOS_DOCKER_HOST) {
      initializationFunctions.push(fetchActiveDocksFromConfiguration);
    }
    else {
      initializationFunctions.push(fetchActiveDocksFromMavis);
    }

    async.parallel(initializationFunctions, function (err) {
      if (err) {
        console.log(err);
        return;
      }
      processOrphans();
    });

    function connectToMongoDB (cb) {
      console.log('connecting to mongodb', process.env.KHRONOS_MONGO);
      MongoClient.connect(process.env.KHRONOS_MONGO, function (err, _db) {
        console.log('connected to mongodb');
        db = _db;
        cb(err);
      });
    }

    function fetchActiveDocksFromConfiguration (cb) {
      console.log('fetching docks from configuration');
      activeDocks = [{
        host: ('http://'+
          process.env.KHRONOS_DOCKER_HOST+
          ':'+
          process.env.KHRONOS_DOCKER_PORT)
      }];
      cb();
    }

    function fetchActiveDocksFromMavis (cb) {
      console.log('fetching docks from mavis');
      request(process.env.KHRONOS_MAVIS, function (err, http, response) {
        try {
          activeDocks = JSON.parse(response);
        }
        catch (e) {
          return cb(e);
        }
        console.log('activeDocks', activeDocks);
        cb(err);
      });
    }

    function processOrphans () {
      async.forEach(activeDocks,
      function (dock, dockCB) {
        console.log('connecting to dockerd at ' + dock.host);
        var regexDockURL = /^http:\/\/([A-z0-9]+):([0-9]+)/;
        var execRes = regexDockURL.exec(dock.host);
        var host = execRes[1];
        var port = execRes[2];
        var docker = new Docker({
          host: host,
          port: port
        });
        async.series([
          function fetchImages (cb) {
            var regexTestImageTag = new RegExp('^'+process.env.KHRONOS_DOCKER_REGISTRY+'\/[0-9]+\/[A-z0-9]+:[A-z0-9]+');

            // unclear if I can query subset?
            // https://docs.docker.com/reference/api/docker_remote_api_v1.16/#list-images
            console.log('fetching images...');
            var start = new Date();
            docker.listImages({}, function (err, _images) {
              console.log('images fetched');
              stats.timing('fetch-images-dock'+dock.host, new Date()-start);
              if (err) {
                console.log(err);
                return cb(err);
              }
              console.log('prefiltered images', _images);
              images = _images.filter(function (image) {
                // return all images from runnable.com registry
                return image.RepoTags.length && regexTestImageTag.test(image.RepoTags[0]);
              });
              console.log('images length: ' + images.length);
              cb();
            });
          },

          function fetchContextVersions (fetchCVCB) {
            console.log('fetching context-versions in chunks...');

            var contextVersionsCollection = db.collection('contextversions');
            var regexImageTagCV = new RegExp('^'+process.env.KHRONOS_DOCKER_REGISTRY+'\/[0-9]+\/([A-z0-9]+):([A-z0-9]+)');

            // chunk check context versions in db for batch of 100 images
            var chunkSize = 100;
            var lowerBound = 0;
            var upperBound = Math.min(chunkSize, images.length);
            var imageSet = [];
            if (images.length) {
              imageSet = images.slice(lowerBound, upperBound);
            }

            async.doWhilst(
            function (doWhilstCB) {
              //see if all these images are in mongodb
              var cvIds = imageSet.map(function (image) {
                var regexExecResult = regexImageTagCV.exec(image.RepoTags[0]);
                return new ObjectID(regexExecResult[2]);
              });
              console.log('fetching chunk', lowerBound, upperBound);
              var start = new Date();
              contextVersionsCollection.find({
                "_id": {
                  "$in": cvIds
                }
              }).toArray(function (err, results) {
                if (err) {
                  return doWhilstCB(err);
                }
                stats.timing('fetch-context-versions', new Date()-start, [cvIds.length, results.length]);
                var numberMissing = (upperBound - lowerBound) - results.length;
                if (numberMissing) {
                  console.log(numberMissing + ' images on box not in database, cleaning up...');
                  orphanedImages += numberMissing;
                  var foundCvIDs = results.map(function (res) {
                    return res['_id'].toString();
                  });

                  // figure out which images in imageSet do not have corresponding context-versions
                  async.forEach(imageSet, function (image, eachCB) {
                    var imageCVIDEqualsFn = equals(regexImageTagCV.exec(image.RepoTags[0])[2]);
                    if (-1 === findIndex(foundCvIDs, imageCVIDEqualsFn)) {
                      // this image does not have a cv, delete
                      console.log('cv not found for image: ' + image.Id);
                      docker.getImage(image.Id).remove(function (err) {
                        if (err) { throw err; }
                        eachCB();
                      });
                    }
                    else {
                      console.log('cv FOUND for image: ' + image.Id);
                      eachCB();
                    }
                  }, doWhilstCB);

                }
                else {
                  console.log('all images accounted for in DB, proceeding...');
                  doWhilstCB();
                }

              });
            },
            function check () {
              lowerBound = upperBound;
              upperBound = Math.min(upperBound+chunkSize, images.length);
              imageSet = images.slice(lowerBound, upperBound);
              return imageSet.length;
            },
            fetchCVCB);
          }
        ], dockCB);
      }, function (err) {
        if (err) { throw err; }
        console.log('done');
        console.log('found ' + orphanedImages + ' orphaned images');
        stats.timing('complete-prune-orphan-images', new Date()-startPrune);
        finalCB();
      });
    }

  };
