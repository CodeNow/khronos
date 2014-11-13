#!/usr/bin/env node
/**
 * Prunes containers running/dead > 12 hours
 */
var async = require('async');
var Docker = require('dockerode');
var argv = require('optimist').argv;

var MAX_TIME_CONTAINER = 60 * 60 * 12; // 12 hours

if (typeof argv.t !== 'undefined') {
  MAX_TIME_CONTAINER = 60*60*parseInt(argv.t);
}

console.log('connecting to docker daemon');
var docker = new Docker({host:'127.0.0.1', port:4243});

console.log('fetching containers');
docker.listContainers({all: true}, function (err, containers) {
  var currentTime = Math.floor(Date.now() / 1000); // convert nanoseconds to seconds
  var deleteContainerStartedBeforeTime = currentTime - MAX_TIME_CONTAINER;
  var containersToDelete = containers.filter(function(container) {
    return container.Created < deleteContainerStartedBeforeTime;
  });
  console.log('found ' + containersToDelete.length + ' containers.');
  async.each(containersToDelete, function(container, cb){
    var Container = docker.getContainer(container.Id);
    Container.stop(function() {
      Container.remove(function() {
        cb();
      });
    });
  }, function(err, results) {
    console.log(containersToDelete.length + ' containers deleted.');
  });
});
