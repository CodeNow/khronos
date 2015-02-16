'use strict';

var Dockerode = require('dockerode');
var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);

function Docker () {
}

Docker.prototype.connect = function (dock) {
  debug.log('connecting to dockerd at ' + dock.host);
  var regexDockURL = /^http:\/\/([A-z0-9\.]+):([0-9]+)/;
  var execRes = regexDockURL.exec(dock.host);
  var host = execRes[1];
  var port = execRes[2];
  var dockerode = new Dockerode({
    host: host,
    port: port
  });
  this.dock = dock;
  this.dockerode = dockerode;
  this.images = [];
};

Docker.prototype.getImages = function (cb) {
  debug.log('getImages');
  var regexTestImageTag = new RegExp('^'+process.env.KHRONOS_DOCKER_REGISTRY+'\/[0-9]+\/[A-z0-9]+:[A-z0-9]+');
  var timingKey = 'getImages-'+this.dock.host;
  datadog.startTiming(timingKey);
  this.dockerode.listImages({}, function (err, _images) {
    datadog.endTiming(timingKey);
    this.images = _images
      .map(function (image) {
        if (!image.RepoTags.length) {
          return image;
        }
        image.RepoTags.filter(function (tag) {
          return regexTestImageTag.test(tag);
        });
        return image;
      })
      .filter(function (image) {
        return image.RepoTags.length;
      });
    debug.log('getImages length: ' + this.images.length);
    cb(err);
  }.bind(this));
};

Docker.prototype.removeImage = function (imageId, cb) {
  debug.log('removeImage');
  var timingKey = 'removeImage';
  datadog.startTiming(timingKey);
  this.dockerode.getImage(imageId).remove(function (err) {
    datadog.endTiming(timingKey, this.dock.host+':'+imageId+':'+((err) ? 'error' : 'success'));
    cb(err);
  }.bind(this));
};

module.exports = function () {
  return new Docker();
};
