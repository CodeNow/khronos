#!/usr/bin/env node
/**
 * Prunes containers running/dead > 12 hours
 */
var async = require('async');
var config = require('config/index');
var Docker = require('dockerode');

console.log('connecting to docker daemon');
var docker = new Docker({host:'127.0.0.1', port:4243});

console.log('fetching containers');
docker.listContainers({all: true}, function (err, containers) {
  var currentTime = Math.floor(Date.now() / 1000); // convert nanoseconds to seconds
  var deleteContainerStartedBeforeTime = currentTime - config.settings.maxContainerLiveTime;
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
