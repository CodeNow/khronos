'use strict';

var async = require('async');
var crypto = require('crypto');

module.exports = {
  deleteAllImagesAndContainers: function (docker, cb) {
    async.parallel([
      module.exports.deleteAllImages.bind(null, docker),
      module.exports.deleteAllContainers.bind(null, docker)
    ], cb);
  },
  deleteAllImages: function (docker, cb) {
    docker.listImages(function (err, images) {
      if (err) { return cb(err); }
      async.each(images, function (image, eachCb) {
        docker.getImage(image.Id).remove(eachCb);
      }, cb);
    });
  },
  deleteAllContainers: function (docker, cb) {
    docker.listContainers({ all: true }, function (err, containers) {
      if (err) { return cb(err); }
      async.each(containers, function (container, cb) {
        docker.getContainer(container.Id).remove(cb);
      }, cb);
    });
  },
  getRandomImageName: function () {
    return process.env.KHRONOS_DOCKER_REGISTRY +
      '/' +
      (Math.random()*999999 | 0) +
      '/' +
      randomHash().substr(0, 24) +
      ':' +
      randomHash().substr(0, 24);

    function randomHash () {
      var shasum = crypto.createHash('sha256').update(Math.random() + '');
      return shasum.digest('hex');
    }
  },
  createRandomContainers: function (docker, num, cb) {
    async.times(num, function (n, cb) {
      docker.createContainer({ Image: module.exports.getRandomImageName() }, cb);
    }, cb);
  }
};
