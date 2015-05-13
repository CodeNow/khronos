/**
 * Wrapper class for select operations using dockerode
 * @module models/docker/docker
 */
'use strict';

var Dockerode = require('dockerode');
var isFunction = require('101/is-function');
var keypath = require('keypather')();

var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);

module.exports = function () {
  return new Docker();
};

var TEST_IMAGE_TAG =
    new RegExp('^'+process.env.KHRONOS_DOCKER_REGISTRY+'\/[0-9]+\/[A-z0-9]+:[A-z0-9]+');

/**
 * @class
 */
function Docker () {}

/**
 * Initiates a connection to a docker daemon
 * @param {string} dock
 * @return null
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
 *
 * @param {Array} imageFilters - array of image filter RegExp objects (filter
 *   matching 1 or more)
 * @param {Function} cb
 * @return null
 *
 * @param {Function} cb
 * @return null
 */
Docker.prototype.getContainers = function (imageFilters, cb) {
  if (isFunction(imageFilters)) {
    cb = imageFilters;
    imageFilters = null;
  }
  debug.log('getContainers for dock '+this.dock);
  var timingKey = 'getContainers-'+this.dock;
  datadog.startTiming(timingKey);
  this.dockerode.listContainers({all: true}, function (err, _containers) {
    datadog.endTiming(timingKey);
    if (err) {
      debug.log('error', err);
      return cb(err);
    }
    if (imageFilters) {
      this.containers = _containers.filter(function (container) {
        return imageFilters.some(function (filterRegExp) {
          return filterRegExp.test(container.Image);
        });
      });
    }
    debug.log('getContainers length: '+this.containers.length);
    cb(err);
  }.bind(this));
};

/**
 * Fetches all images on a host and filters for subset
 * with pattern-matching tags.
 *
 * Function returns a list of all the tags from each image
 * Flattens two dimensional array.
 *
 * Also fetches list of images without tags
 *
 * @param {Function} cb
 */
Docker.prototype.getImages = function (cb) {
  debug.log('getImages for dock '+this.dock);
  var timingKey = 'getImages-'+this.dock;
  datadog.startTiming(timingKey);
  this.dockerode.listImages({all: true}, function (err, _images) {
    datadog.endTiming(timingKey);
    this.taglessImages = [];
    // preserve all tagless images in "taglessImages"
    // and filter-remove them from _images
    _images.filter(function (image) {
      if(~keypath.get(image, 'RepoTags[0]').indexOf('\u003cnone\u003e')) {
        this.taglessImages.push(image);
        return false;
      }
      return true;
    });
    debug.log('getImages tagless length: '+this.taglessImages.length);
    this.images = _images
      .map(function (image) {
        if (!image.RepoTags.length) {
          return image;
        }
        image.RepoTags = image.RepoTags.filter(function (tag) {
          return TEST_IMAGE_TAG.test(tag);
        });
        return image;
      })
      .reduce(function (imageTags, image) {
        return imageTags.concat(image.RepoTags || []);
      }, []);
    debug.log('getImages length: '+this.images.length);
    cb();
  }.bind(this));
};

/**
 * Removes a specific image from a host
 * @param {string} imageId
 * @param {Function} cb
 */
Docker.prototype.removeImage = function (imageId, cb) {
  if (process.env.DRY_RUN) {
    return cb();
  }
  var timingKey = 'removeImage';
  datadog.startTiming(timingKey);
  this.dockerode.getImage(imageId).remove(function (err) {
    datadog.endTiming(timingKey, this.dock+':'+((err) ? 'error' : 'success'));
    cb(err);
  }.bind(this));
};

/**
 * Removes a specific container from a host
 * Stops & Removes the container
 * @param {string} imageId
 * @param {Function} cb
 */
Docker.prototype.removeContainer = function (containerId, cb) {
  if (process.env.DRY_RUN) {
    return cb();
  }
  var timingKey = 'removeContainer';
  datadog.startTiming(timingKey);
  var container = this.dockerode.getContainer(containerId);
  container.kill(function (err) {
    if (err) { debug.log(err); }
    container.remove(function (err) {
      if (err) { debug.log(err); }
      datadog.endTiming(timingKey, this.dock+':'+((err) ? 'error' : 'success'));
      cb();
    }.bind(this));
  }.bind(this));
};
