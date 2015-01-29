'use strict';

/**
 * Fetch list of images on each dock, verify each image is attached to a context-version in mongodb.
 * Only fetch images with tag indicating image is in our runnable registry.
 * If no associated cv is found, remove image from dock.
 */

var _ = require('underscore');
var Docker = require('dockerode');
var MongoClient = require('mongodb').MongoClient;
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

  var matches = 0;

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
          docker.listImages({}, function (err, _images) {
            if (err) {
              console.log(err);
              return cb(err);
            }

            // TESTING temp
            var fs = require('fs');
            _images = JSON.parse(fs.readFileSync('./images.json').toString());

            images = _images.filter(function (image) {
              // return all images from runnable.com registry
              return image.RepoTags.length && regexTestImageTag.test(image.RepoTags[0]);
            });
            cb();
          });
        },

        function fetchContextVersions (cb) {

          var contextVersionsCollection = db.collection('contextversions');
          var regexImageTagCV = new RegExp('^'+process.env.KHRONOS_DOCKER_REGISTRY+'\/[0-9]+\/([A-z0-9]+):([A-z0-9]+)');

          // chunk check context versions in db for batch of 100 images
          var upperBound = 100;
          var imageSet = [];
          async.whilst(function () {
            imageSet = images.slice(upperBound-100, upperBound);
            upperBound += 100;
            return imageSet.length;
          },
          function (cb) {
            //see if all these images are in mongodb
            var cvIds = imageSet.map(function (image) {
              var regexExecResult = regexImageTagCV.exec(image.RepoTags[0]);
              return regexExecResult[2];
            });
            contexVersionsCollection.find({
              "_id": {
                "$in": cvIds
              }
            }).toArray(function (err, results) {
              if (err) {
                return cb(err);
              }
              console.log('results', results);
              console.log('results.length', results.length);
            });
          }, cb);

          /*
          // TESTING temp
          var fs = require('fs');
          var a1 = JSON.parse(fs.readFileSync('./context-versions.json').toString());
          var a2 = JSON.parse(fs.readFileSync('./context-versions2.json').toString());
          contextVersions = a1.concat(a2);
          return cb();

          var contextVersionsCollection = db.collection('contextversions');
          contextVersionsCollection.find().limit(100).toArray(function (err, results) {
            contextVersions = results;
            cb();
          });
          */
        },

        function pruneImagesWithoutAssociatedCV (cb) {

          // TESTING temp
          // images = images.splice(0, 500);

          var upperBound = 100;
          var imageSet = [];
          async.whilst(function () {
            imageSet = images.slice(upperBound-100, upperBound);
            upperBound += 100;
            return imageSet.length;
          },
          function (doCb) {

            var counter = 0;
            async.forEach(imageSet, function (image, asyncCb) {

              var result = find(contextVersions, function (cv) {
                //var regexImageTagCV = new RegExp('^'+process.env.KHRONOS_DOCKER_REGISTRY+'\/[0-9]+\/([A-z0-9]+):([A-z0-9]+)');
                //var regexExecResult = regexImageTagCV.exec(image.RepoTags[0]);
                //console.log(regexExecResult[2], cv._id, (regexExecResult[2] === cv._id), matches, upperBound, imageSet.length, counter);
                //return regexExecResult[2] === cv._id;
                console.log(counter);
                return false;
              });
              if (result) {
                matches++;
                // TODO delete image async
              }
              counter++;
              asyncCb();

            }, doCb);
          },
          cb);

        }
      ], cb);
    }, function (err) {
      console.log('done');
      console.log('matches ' + matches);
      console.log('contextversions: ' + contextVersions.length);
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
