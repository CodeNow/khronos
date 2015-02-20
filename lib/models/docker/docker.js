/**
 * Wrapper class for select operations using dockerode
 * @module models/docker/docker
 */
'use strict';

var Dockerode = require('dockerode');
var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);

module.exports = function () {
  return new Docker();
};

/* constructor */
function Docker () {}

/**
 * Initiates a connection to a docker daemon
 * @param {string} dock
 */
Docker.prototype.connect = function (dock) {
  debug.log('connecting to dockerd at ' + dock);
  var regexDockURL = /^http:\/\/([A-z0-9\.]+):([0-9]+)/;
  var execRes = regexDockURL.exec(dock);
  var host = execRes[1];
  var port = execRes[2];
  var dockerode = new Dockerode({
    host: host,
    port: port
  });
  this.dock = dock;
  this.dockerode = dockerode;
  this.images = [];
  this.containers = [];
};

/**
 * Fetches all containers on a host and filters for subset
 * with pattern matching tags.
 * @param {Function} cb
 */
Docker.prototype.getContainers = function (cb) {
  debug.log('getContainers for dock'+this.dock);
  var timingKey = 'getContainers-'+this.dock;
  datadog.startTiming(timingKey);
  this.dockerode.listContainers({}, function (err, _containers) {
    datadog.endTiming(timingKey);
    this.containers = _containers;
    cb(err);
    debug.log('getContainers length: '+this.containers.length);
  }.bind(this));
};

/**
 * Fetches all images on a host and filters for subset
 * with pattern-matching tags.
 * @param {Function} cb
 */
Docker.prototype.getImages = function (cb) {
  debug.log('getImages for dock '+this.dock);
  var regexTestImageTag =
    new RegExp('^'+process.env.KHRONOS_DOCKER_REGISTRY+'\/[0-9]+\/[A-z0-9]+:[A-z0-9]+');
  var timingKey = 'getImages-'+this.dock;
  datadog.startTiming(timingKey);
  this.dockerode.listImages({}, function (err, _images) {
    datadog.endTiming(timingKey);
    this.images = _images
      .map(function (image) {
        if (!image.RepoTags.length) {
          return image;
        }
        image.RepoTags = image.RepoTags.filter(function (tag) {
          return regexTestImageTag.test(tag);
        });
        return image;
      })
      .reduce(function (imageTags, image) {
        return imageTags.concat(image.RepoTags || []);
      }, []);
    debug.log('getImages length: '+this.images.length);
    cb(err);
  }.bind(this));
};

/**
 * Removes a specific image from a host
 * @param {string} imageId
 * @param {Function} cb
 */
Docker.prototype.removeImage = function (imageId, cb) {
  var timingKey = 'removeImage';
  datadog.startTiming(timingKey);
  this.dockerode.getImage(imageId).remove(function (err) {
    datadog.endTiming(timingKey, this.dock+':'+imageId+':'+((err) ? 'error' : 'success'));
    cb(err);
  }.bind(this));
};
