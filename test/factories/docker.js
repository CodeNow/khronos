'use strict';

var async = require('async');

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
  }
};
