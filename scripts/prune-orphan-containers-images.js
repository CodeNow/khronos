/**
 * Fetch list of images on each dock, verify each image is attached to a context-version in mongodb.
 * Only fetch images with tag indicating image is in our runnable registry.
 * If no associated cv is found, remove image from dock.
 */

var Docker = require('dockerode');
var MongoClient = require('mongodb').MongoClient;
var async = require('async');
var request = require('request');

module.exports = function(cb) {
  'use strict';

  // for each dock
    // find all images with tag 'registry.runnable.io'
    // query mongodb context-versions and if any image is not in db, remove it from dock

  var mavisResponse;
  var db;
  var containers;

  async.parallel([
    function fetchActiveDocksFromMavis (cb) {
      request(process.env.MAVIS, function (err, http, response) {
        try {
          mavisResponse = JSON.parse(response);
        } catch (e) {
          return cb(e);
        }
        cb(err);
      });
    },
    function connectoToMongoDB (cb) {
      MongoClient.connect(process.env.MONGO, function (err, _db) {
        db = _db;
        cb(err);
      });
    }
  ], function (err) {
    if (err) {
      console.log(err);
      return;
    }
    processOrphans();
  });

  function processOrphans () {
    async.forEach(mavisResponse,
    function (dock, cb) {
      if (process.env.NODE_ENV === 'local') {
        console.log('connecting to dockerd at tcp://localhost:4243');
        var docker = new Docker({
          host: 'localhost',
          port: '4243'
        });
      }
      else {
        console.log('connecting to dockerd at ' + dock.host);
        var parts = dock.host.split(':');
        var docker = new Docker({
          host: (parts[0]+parts[1]),
          port: parts[2]
        });
      }
      async.series([
        function fetchImagesOnDock (cb) {
          docker.listImages(function (err, _images) {
            console.log(err, _images);
          });
          /*
          docker.listContainers({all: true}, function (err, _containers) {
            containers = _containers;
            cb(err);
          });
          */
        },
        function fetchDocuments (cb) {
          var instances = db.collection('instances');
          var contextVersions = db.collection('contextversions');
        }
      ], cb);
    }, function (err) {
      console.log('done');
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
