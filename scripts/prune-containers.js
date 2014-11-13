#!/usr/bin/env node
/**
 * Prunes containers running/dead > 12 hours
 */
var async = require('async');
var config = require('../config');
var Docker = require('dockerode');

console.log(config);

console.log('connecting to docker daemon');
var docker = new Docker({host:config.network.host, port:config.network.port});

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
