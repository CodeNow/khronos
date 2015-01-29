'use strict';

/**
 * Fetch list of images on each dock, verify each image is attached to a context-version in mongodb.
 * Only fetch images with tag indicating image is in our runnable registry.
 * If no associated cv is found, remove image from dock.
 */

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
  var arrayOfContextVersions;
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
        function fetchImagesOnDock (cb) {
          var regexTestImageTag = new RegExp('^'+process.env.KHRONOS_DOCKER_REGISTRY+'\/[0-9]+\/[A-z0-9]+:[A-z0-9]+');
          // unclear if I can query subset?
          // https://docs.docker.com/reference/api/docker_remote_api_v1.16/#list-images
          docker.listImages({}, function (err, _images) {
            if (err) {
              console.log(err);
              return cb(err);
            }
            images = _images.filter(function (image) {
              // return all images from runnable.com registry
              return image.RepoTags.length && regexTestImageTag.test(image.RepoTags[0]);
            });
            cb();
          });
        },

        function fetchDocuments (cb) {
          var contextVersions = db.collection('contextversions');
          contextVersions.find().toArray(function (err, results) {
            arrayOfContextVersions = results;
            cb();
          });
        },

        function pruneImagesWithoutAssociatedCV (cb) {
          async.forEach(images, function (image, cb) {
            // find associated context version
            var result = find(arrayOfContextVersions, function (cv) {
              var regexImageTagCV = new RegExp('^'+process.env.KHRONOS_DOCKER_REGISTRY+'\/[0-9]+\/([A-z0-9]+):([A-z0-9]+)');
              var regexExecResult = regexImageTagCV.exec(image.RepoTags[0]);
              console.log(regexExecResult[2], cv._id, (regexExecResult[2] === cv._id));
              return regexExecResult[2] === cv._id;
            });
            if (result) {
              console.log('found!');
              matches++;
            }
            cb();
          }, cb);
        }
      ], cb);
    }, function (err) {
      console.log('done');
      console.log('matches ' + matches);
      console.log('images: ' + images.length);
      console.log('contextversions: ' + arrayOfContextVersions.length);
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
