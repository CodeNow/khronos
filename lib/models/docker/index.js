/**
 * Wrapper class for select operations using dockerode
 * @module models/docker/docker
 */
'use strict';

var Dockerode = require('dockerode');
var assign = require('101/assign');
var fs = require('fs');
var isFunction = require('101/is-function');
var join = require('path').join;
var keypath = require('keypather')();

var datadog = require('models/datadog')(__filename);
var log = require('logger').getChild(__filename);

var intervalDelay = parseInt(process.env.KHRONOS_API_REQUEST_INTERVAL_DELAY);

var certs = {};
try {
  var certPath = process.env.DOCKER_CERT_PATH || '/etc/ssl/docker';
  certs.ca = fs.readFileSync(join(certPath, 'ca.pem'));
  certs.cert = fs.readFileSync(join(certPath, 'cert.pem'));
  certs.key = fs.readFileSync(join(certPath, 'key.pem'));
} catch (err) {
  log.error({ err: err }, 'cannot load certificates for docker');
  // use all or none of the certificates
  certs = {};
}

module.exports = function () { return new Docker(); };

var TEST_IMAGE_TAG =
  new RegExp('^' + process.env.KHRONOS_DOCKER_REGISTRY + '\/[0-9]+\/[A-z0-9]+:[A-z0-9]+');

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
  log.trace({ dock: dock }, 'Docker.prototype.connect');
  var regexDockURL = /^http:\/\/([A-z0-9\.]+):([0-9]+)/;
  var execRes = regexDockURL.exec(dock);
  var host = execRes[1];
  var port = execRes[2];
  var dockerodeOpts = {
    host: host,
    port: port
  };
  assign(dockerodeOpts, certs);
  var dockerode = new Dockerode(dockerodeOpts);
  this.dock = dock;
  this.dockerode = dockerode;
  this.images = [];
  this.taglessImages = [];
  this.containers = [];
};

/**
 * Fetches all containers on a host and filters for subset
 * with pattern matching tags.
 *
 * @param {Object} queryOpts - docker api query options
 * @param {Array} imageFilters - array of image filter RegExp objects (filter
 *   matching 1 or more)
 * @param {Function} cb
 * @return null
 *
 * @param {Object} queryOpts - docker api query options
 * @param {Function} cb
 * @return null
 */
Docker.prototype.getContainers = function (queryOpts, imageFilters, cb) {
  if (isFunction(imageFilters)) {
    cb = imageFilters;
    imageFilters = null;
  }
  log.trace({
    dock: this.dock,
    queryOpts: queryOpts,
    imageFilters: imageFilters
  }, 'Docker.prototype.getContainers');
  var timingKey = 'getContainers-' + this.dock;
  datadog.startTiming(timingKey);
  this.dockerode.listContainers(queryOpts, function (err, _containers) {
    datadog.endTiming(timingKey);
    if (err) {
      log.error({ err: err }, 'Docker.prototype.getContainers listContainers error');
      return cb(err);
    }
    log.trace({
      containersCount: _containers.length
    }, 'Docker prototype.getContainers listContainers success');
    if (imageFilters) {
      this.containers = _containers.filter(function (container) {
        return imageFilters.some(function (filterRegExp) {
          return filterRegExp.test(container.Image);
        });
      });
    }
    log.trace({
      containersCount: this.containers.length
    }, 'Docker.prototype.getContainers filtered length');
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
 * @param {Number} minAgeSeconds Minimum image age (in seconds) (optional)
 *   only return images older than this value
 * @param {Function} cb
 */
Docker.prototype.getImages = function (minAgeSeconds, cb) {
  if (!minAgeSeconds) {
    cb = minAgeSeconds;
  }
  var _this = this;
  log.trace({
    minAgeSeconds: minAgeSeconds,
    dock: this.dock
  }, 'Docker.prototype.getImages');
  var timingKey = 'getImages-' + this.dock;
  datadog.startTiming(timingKey);
  this.dockerode.listImages({all: true}, function (err, _images) {
    datadog.endTiming(timingKey);
    if (err) {
      log.error({ err: err }, 'Docker.prototype.getImages listImages error');
      return cb();
    }
    if (minAgeSeconds) {
      var currentEpochSeconds = Math.floor(new Date().valueOf() / 1000);
      _images = _images.filter(function (image) {
        return (currentEpochSeconds - parseInt(image.Created)) > minAgeSeconds;
      });
    }
    // preserve all tagless images in "taglessImages"
    // and filter-remove them from _images
    _images = _images.filter(function (image) {
      if(~keypath.get(image, 'RepoTags[0]').indexOf('\u003cnone\u003e')) {
        _this.taglessImages.push(image);
        return false;
      }
      return true;
    });
    log.trace({
      taglessImagesLength: this.taglessImages.length
    }, 'Docker.prototype.getImages tagless images length');
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
    log.trace({
      imagesLength: this.images.length
    }, 'Docker.prototype.getImages images length');
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
    setTimeout(function () {
      // do not bubble errors
      cb();
    }, intervalDelay);
  }.bind(this));
};

/**
 * Removes a specific container from a host
 * Stops & Removes the container
 * @param {string} imageId
 * @param {Function} cb
 */
Docker.prototype.removeContainer = function (containerId, cb) {
  log.trace({ containerId: containerId }, 'Docker.prototype.removeContainer');
  if (process.env.DRY_RUN) {
    return cb();
  }
  var timingKey = 'removeContainer';
  datadog.startTiming(timingKey);
  var container = this.dockerode.getContainer(containerId);
  container.kill(function (err) {
    if (err) {
      log.error({
        err: err,
        containerId: containerId
      }, 'Docker.prototype.removeContainer kill error');
    }
    log.trace({
      containerId: containerId
    }, 'Docker.prototype.removeContainer kill success');
    this.removeStoppedContainer(containerId, function (err) {
      if (err) {
        log.error({
          err: err,
          containerId: containerId
        }, 'Docker.prototype.removeContainer remove error');
      }
      log.trace({
        containerId: containerId
      }, 'Docker.prototype.removeContainer remove success');
      datadog.endTiming(timingKey, this.dock+':'+((err) ? 'error' : 'success'));
      setTimeout(function () {
        // do not bubble errors
        cb();
      }, intervalDelay);
    }.bind(this));
  }.bind(this));
};

/**
 * Removes a stopped container
 * removes the container from image store on dock
 * @param {string} imageId
 * @param {Function} cb
 */
Docker.prototype.removeStoppedContainer = function (containerId, cb) {
  log.trace({
    containerId: containerId
  }, 'Docker.prototype.removeStoppedContainer');
  if (process.env.DRY_RUN) {
    return cb();
  }
  var timingKey = 'removeStoppedContainer';
  datadog.startTiming(timingKey);
  var container = this.dockerode.getContainer(containerId);
  container.remove(function (err) {
    if (err) {
      log.error({
        err: err,
        containerId: containerId
      }, 'Docker.prototype.removeStoppedContainer remove error');
    }
    else {
      log.trace({
        containerId: containerId
      }, 'Docker.prototype.removeStoppedContainer remove success');
    }
    datadog.endTiming(timingKey, this.dock+':'+((err) ? 'error' : 'success'));
    setTimeout(function () {
      // do not bubble errors
      cb();
    }, intervalDelay);
  }.bind(this));
};
