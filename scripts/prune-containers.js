/**
 * Prunes containers running/dead > 12 hours
 * from image "docker-image-builder"
 */
var async = require('async');
var config = require('../config');
var Docker = require('dockerode');

module.exports = function(cb) {
  console.log('connecting to docker daemon');
  var docker = new Docker({host:config.network.host, port:config.network.port});

  console.log('fetching containers');
  docker.listContainers({all: true}, function (err, containers) {
    var currentTime = Math.floor(Date.now() / 1000); // convert nanoseconds to seconds
    var deleteContainerStartedBeforeTime = currentTime - config.settings.maxContainerLiveTime;
    var containersToDelete = containers.filter(function(container) {
      return container.Created < deleteContainerStartedBeforeTime &&
             container.Image === 'docker-image-builder';
    });
    console.log('found ' + containersToDelete.length + ' containers');
    async.each(containersToDelete, function(containerJSON, cb){
      var container = docker.getContainer(containerJSON.Id);
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
};
