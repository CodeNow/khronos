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
var find = require('101/find');
var keypath = require('keypather')();
var request = require('request');

module.exports = function(cb) {

  // for each dock
    // find all images with tag 'registry.runnable.io'
    // query mongodb context-versions and if any image is not in db, remove it from dock

  var activeDocks;
  var contextVersions;
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
    MongoClient.connect(process.env.KHRONOS_MONGO, function (err, _db) {
      db = _db;
      cb(err);
    });
  }

  function fetchActiveDocksFromConfiguration (cb) {
    activeDocks = [{
      host: ('http://'+
        process.env.KHRONOS_DOCKER_HOST+
        ':'+
        process.env.KHRONOS_DOCKER_PORT)
    }];
    cb();
  }

  function fetchActiveDocksFromMavis (cb) {
    request(process.env.KHRONOS_MAVIS, function (err, http, response) {
      try {
        activeDocks = JSON.parse(response);
      } catch (e) {
        return cb(e);
      }
      cb(err);
    });
  }

  function processOrphans () {
    async.forEach(activeDocks,
    function (dock, cb) {
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
          docker.listImages({}, function (err, _images) {
            console.log('images fetched');
            if (err) {
              console.log(err);
              return cb(err);
            }
            images = _images.filter(function (image) {
              // return all images from runnable.com registry
              return image.RepoTags.length && regexTestImageTag.test(image.RepoTags[0]);
            });
            console.log('images length: ' + images.length);
            cb();
          });
        },

        function fetchContextVersions (cb) {
          console.log('fetching context-versions in chunks...');

          var contextVersionsCollection = db.collection('contextversions');
          var regexImageTagCV = new RegExp('^'+process.env.KHRONOS_DOCKER_REGISTRY+'\/[0-9]+\/([A-z0-9]+):([A-z0-9]+)');

          // chunk check context versions in db for batch of 100 images
          var chunkSize = 100;
          var lowerBound = 0;
          var upperBound = Math.min(chunkSize, images.length);
          var imageSet = [];
          async.whilst(function () {
            lowerBound = upperBound;
            upperBound = Math.min(upperBound+chunkSize, images.length);
            imageSet = images.slice(lowerBound, upperBound);
            return imageSet.length;
          },
          function (cb) {
            //see if all these images are in mongodb
            var cvIds = imageSet.map(function (image) {
              var regexExecResult = regexImageTagCV.exec(image.RepoTags[0]);
              return new ObjectID(regexExecResult[2]);
            });
            console.log('fetching chunk', lowerBound, upperBound);
            contextVersionsCollection.find({
              "_id": {
                "$in": cvIds
              }
            }).toArray(function (err, results) {
              if (err) {
                return cb(err);
              }
              if (results.length !== (upperBound-lowerBound)) {
                console.log(((upperBound-lowerBound) - results.length) + ' images on box not in database, cleaning up...');
                orphanedImages += ((upperBound-lowerBound) - results.length);
                cb();
              } else {
                console.log('all images accounted for in DB, proceeding...');
                cb();
              }
            });
          }, cb);
        }
      ], cb);
    }, function (err) {
      console.log('done');
      console.log('found ' + orphanedImages + ' orphaned images');
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
