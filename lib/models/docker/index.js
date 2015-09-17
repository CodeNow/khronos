/**
 * Wrapper class for select operations using dockerode
 * @module models/docker/docker
 */
'use strict';

var Dockerode = require('dockerode');
var assign = require('101/assign');
var datadog = require('models/datadog')(__filename);
var fs = require('fs');
var isFunction = require('101/is-function');
var join = require('path').join;
var keypath = require('keypather')();
var log = require('logger').getChild(__filename);
var url = require('url');

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

module.exports = Docker;

var TEST_IMAGE_TAG = new RegExp('^' + process.env.KHRONOS_DOCKER_REGISTRY +
  '\/[0-9]+\/[A-z0-9]+:[A-z0-9]+');

/**
 * @class
 */
function Docker (dockURL) {
  this.dockURL = dockURL;
  log.trace({ dock: this.dockURL }, 'Docker Constructor');
  var parsedURL = url.parse(dockURL);
  var dockerodeOpts = {
    host: parsedURL.hostname,
    port: parsedURL.port
  };
  // put the certs (if they exist) on the opts
  assign(dockerodeOpts, certs);
  this.client = new Dockerode(dockerodeOpts);
}

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
  if (isFunction(queryOpts)) {
    cb = queryOpts;
    queryOpts = {};
    imageFilters = null;
  } else if (isFunction(imageFilters)) {
    cb = imageFilters;
    imageFilters = null;
  }
  log.trace({
    dock: this.dockURL,
    queryOpts: queryOpts,
    imageFilters: imageFilters
  }, 'Docker.prototype.getContainers');
  var timingKey = 'getContainers-' + this.dockURL;
  datadog.startTiming(timingKey);
  this.client.listContainers(queryOpts, function (err, containers) {
    datadog.endTiming(timingKey);
    if (err) {
      log.error({ err: err }, 'Docker.prototype.getContainers listContainers error');
      return cb(err);
    }
    log.trace({
      containersCount: containers.length
    }, 'Docker prototype.getContainers listContainers success');
    if (imageFilters) {
      containers = containers.filter(function (container) {
        return imageFilters.some(function (filterRegExp) {
          return filterRegExp.test(container.Image);
        });
      });
    }
    log.trace({
      containersCount: containers.length
    }, 'Docker.prototype.getContainers filtered length');
    cb(null, containers);
  });
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
  if (isFunction(minAgeSeconds)) {
    cb = minAgeSeconds;
    minAgeSeconds = null;
  }
  log.trace({
    minAgeSeconds: minAgeSeconds,
    dock: this.dockURL
  }, 'Docker.prototype.getImages');
  var timingKey = 'getImages-' + this.dockURL;
  datadog.startTiming(timingKey);
  this.client.listImages({ all: true }, function (err, images) {
    datadog.endTiming(timingKey);
    if (err) {
      log.error({ err: err }, 'Docker.prototype.getImages listImages error');
      return cb(err);
    }
    var taglessImages = [];
    if (minAgeSeconds) {
      var currentEpochSeconds = Math.floor(new Date().valueOf() / 1000);
      images = images.filter(function (image) {
        return (currentEpochSeconds - parseInt(image.Created)) > minAgeSeconds;
      });
    }
    // preserve all tagless images in "taglessImages"
    // and filter-remove them from images
    images = images.filter(function (image) {
      if (~keypath.get(image, 'RepoTags[0]').indexOf('\u003cnone\u003e')) {
        taglessImages.push(image);
        return false;
      }
      return true;
    });
    log.trace({
      taglessImagesLength: taglessImages.length
    }, 'Docker.prototype.getImages tagless images length');
    images = images
      .map(function (image) {
        if (!image.RepoTags.length) { return image; }
        // filter out tags that don't include our registry
        image.RepoTags = image.RepoTags.filter(function (tag) {
          return TEST_IMAGE_TAG.test(tag);
        });
        return image;
      })
      .reduce(function (imageTags, image) {
        return imageTags.concat(image.RepoTags || []);
      }, []);
    log.trace({
      imagesLength: images.length
    }, 'Docker.prototype.getImages images length');
    cb(null, images, taglessImages);
  });
};

/**
 * Removes a specific image from a host
 * @param {string} imageId
 * @param {Function} cb
 */
Docker.prototype.removeImage = function (imageId, cb) {
  log.trace({ imageId: imageId }, 'Docker.prototype.removeImage');
  if (process.env.DRY_RUN) { return cb(); }
  var timingKey = 'removeImage';
  datadog.startTiming(timingKey);
  var datadogTagPrefix = this.dockURL + ':';
  this.client.getImage(imageId).remove(function (err) {
    // TODO(bryan): this used to not bubble errors...
    datadog.endTiming(timingKey, datadogTagPrefix + ((err) ? 'error' : 'success'));
    setTimeout(function () { cb(err); }, intervalDelay);
  });
};

/**
 * Removes a specific container from a host
 * Stops & Removes the container
 * @param {string} imageId
 * @param {Function} cb
 */
Docker.prototype.removeContainer = function (containerId, cb) {
  var self = this;
  log.trace({ containerId: containerId }, 'Docker.prototype.removeContainer');
  if (process.env.DRY_RUN) { return cb(); }
  var timingKey = 'removeContainer';
  datadog.startTiming(timingKey);
  var datadogTagPrefix = this.dockURL + ':';
  var container = this.client.getContainer(containerId);
  container.kill(function (err) {
    if (err) {
      log.error({
        err: err,
        containerId: containerId
      }, 'Docker.prototype.removeContainer kill error');
    }
    // TODO(bryan): where was this error going?
    log.trace({ containerId: containerId }, 'Docker.prototype.removeContainer kill success');
    self.removeStoppedContainer(containerId, function (rmErr) {
      if (rmErr) {
        log.error({
          err: rmErr,
          containerId: containerId
        }, 'Docker.prototype.removeContainer remove error');
      }
      log.trace({ containerId: containerId }, 'Docker.prototype.removeContainer remove success');
      datadog.endTiming(timingKey, datadogTagPrefix + ((rmErr) ? 'error' : 'success'));
      // TODO(bryan): this used to not bubble errors...
      setTimeout(function () { cb(rmErr); }, intervalDelay);
    });
  });
};

/**
 * Removes a stopped container
 * removes the container from image store on dock
 * @param {string} imageId
 * @param {Function} cb
 */
Docker.prototype.removeStoppedContainer = function (containerId, cb) {
  log.trace({ containerId: containerId }, 'Docker.prototype.removeStoppedContainer');
  if (process.env.DRY_RUN) { return cb(); }
  var timingKey = 'removeStoppedContainer';
  datadog.startTiming(timingKey);
  var datadogTagPrefix = this.dockURL + ':';
  var container = this.client.getContainer(containerId);
  container.remove(function (err) {
    if (err) {
      log.error({
        err: err,
        containerId: containerId
      }, 'Docker.prototype.removeStoppedContainer remove error');
    }
    log.trace({
      containerId: containerId
    }, 'Docker.prototype.removeStoppedContainer remove success');
    datadog.endTiming(timingKey, datadogTagPrefix + ((err) ? 'error' : 'success'));
    // TODO(bryan): this used to not bubble errors...
    setTimeout(function () { cb(err); }, intervalDelay);
  });
};
