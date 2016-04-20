/**
 * Wrapper class for select operations using dockerode
 * @module lib/models/docker
 */
'use strict'

// external
const assign = require('101/assign')
const Dockerode = require('dockerode')
const fs = require('fs')
const isFunction = require('101/is-function')
const join = require('path').join
const keypath = require('keypather')()
const Promise = require('bluebird')
const url = require('url')

// internal
const datadog = require('models/datadog')('docker')
const log = require('logger').getChild(__filename)

const intervalDelay = parseInt(process.env.KHRONOS_API_REQUEST_INTERVAL_DELAY, 10)

var certs = {}
try {
  var certPath = process.env.DOCKER_CERT_PATH || '/etc/ssl/docker'
  certs.ca = fs.readFileSync(join(certPath, 'ca.pem'))
  certs.cert = fs.readFileSync(join(certPath, 'cert.pem'))
  certs.key = fs.readFileSync(join(certPath, 'key.pem'))
} catch (err) {
  log.warn({ err: err }, 'cannot load certificates for docker')
  // use all or none of the certificates
  certs = {}
}

module.exports = Docker

var TEST_IMAGE_TAG = new RegExp('^' + process.env.KHRONOS_DOCKER_REGISTRY_REGEX +
  '\/[0-9]+\/[A-z0-9]+:[A-z0-9]+')

/**
 * @class
 * @param {string} dockURL URL to access dock (e.g. `http://example.com:4444`)
 */
function Docker (dockURL) {
  this.dockURL = dockURL
  log.info({ dock: this.dockURL }, 'Docker Constructor')
  var parsedURL = url.parse(dockURL)
  var dockerodeOpts = {
    host: parsedURL.hostname,
    port: parsedURL.port
  }
  // put the certs (if they exist) on the opts
  assign(dockerodeOpts, certs)
  this.client = new Dockerode(dockerodeOpts)
}

/**
 * Fetches all containers on a host and filters for subset
 * with pattern matching tags.
 * @param {Object}   queryOpts               - docker api query options
 * @param {Array}    imageFilters            - array of image filter RegExp objects (filter
 *                                               matching 1 or more)
 * @param {[String]} containerIdsToFilterOut - docker container ids that should removed
 *                                               from the returning list
 * @returns {Promise} resolves when the container list is ready
 * @resolves {[Containers]} List of containers the match the imageFilters, but
 */
Docker.prototype.getContainers = function (queryOpts, imageFilters, containerIdsToFilterOut) {
  log.info({
    dock: this.dockURL,
    queryOpts: queryOpts,
    imageFilters: imageFilters,
    containerIdsToFilterOut: containerIdsToFilterOut
  }, 'Docker.prototype.getContainers')
  var timer = datadog.timer('getContainers-' + this.dockURL)
  var self = this

  return Promise.fromCallback(function (cb) {
    self.client.listContainers(queryOpts, cb)
  })
    .finally(function () {
      timer.stop()
    })
    .then(function (containers) {
      log.trace({
        containersCount: containers.length
      }, 'Docker prototype.getContainers listContainers success')
      if (imageFilters) {
        containers = containers.filter(function (container) {
          return imageFilters.some(function (filterRegExp) {
            return filterRegExp.test(container.Image)
          })
        })
      }
      if (containerIdsToFilterOut) {
        containers = containers.filter(function (container) {
          return containerIdsToFilterOut.every(function (containerId) {
            // If every image name fails to match, leave it in the list
            return containerId === container.Id
          })
        })
      }
      log.trace({
        containersCount: containers.length
      }, 'Docker.prototype.getContainers filtered length')
      return containers
    })
    .catch(function (err) {
      log.error({ err: err },
        'Docker.prototype.getContainers listContainers error')
      throw err
    })
}

/**
 * Fetches all images on a host and filters for subset
 * with pattern-matching tags.
 *
 * Function returns a list of all the tags from each image
 * Flattens two dimensional array.
 *
 * Also fetches list of images without tags
 * @param {Number} [minAgeSeconds] Minimum image age (in seconds)
 *   only return images older than this value
 * @param {Function} cb Callback function
 */
Docker.prototype.getImages = function (minAgeSeconds, cb) {
  if (isFunction(minAgeSeconds)) {
    cb = minAgeSeconds
    minAgeSeconds = null
  }
  log.info({
    minAgeSeconds: minAgeSeconds,
    dock: this.dockURL
  }, 'Docker.prototype.getImages')
  var timer = datadog.timer('getImages-' + this.dockURL)
  this.client.listImages({ all: true }, function (err, images) {
    timer.stop()
    if (err) {
      log.error({ err: err }, 'Docker.prototype.getImages listImages error')
      return cb(err)
    }
    var taglessImages = []
    if (minAgeSeconds) {
      var currentEpochSeconds = Math.floor(new Date().valueOf() / 1000)
      images = images.filter(function (image) {
        return (currentEpochSeconds - parseInt(image.Created, 10)) > minAgeSeconds
      })
    }
    // preserve all tagless images in "taglessImages"
    // and filter-remove them from images
    images = images.filter(function (image) {
      if (~keypath.get(image, 'RepoTags[0]').indexOf('\u003cnone\u003e')) {
        taglessImages.push(image)
        return false
      }
      return true
    })
    log.trace({
      taglessImagesLength: taglessImages.length
    }, 'Docker.prototype.getImages tagless images length')
    images = images
      .map(function (image) {
        if (!image.RepoTags.length) { return image }
        // filter out tags that don't include our registry
        image.RepoTags = image.RepoTags.filter(function (tag) {
          return TEST_IMAGE_TAG.test(tag)
        })
        return image
      })
      .reduce(function (imageTags, image) {
        return imageTags.concat(image.RepoTags || [])
      }, [])
    log.trace({
      imagesLength: images.length
    }, 'Docker.prototype.getImages images length')
    cb(null, images, taglessImages)
  })
}

/**
 * Removes a specific image from a host
 * @param {string} imageId ID of the image to remove
 * @param {function} cb Callback function
 * @returns {null} null
 */
Docker.prototype.removeImage = function (imageId, cb) {
  log.info({ imageId: imageId }, 'Docker.prototype.removeImage')
  if (process.env.DRY_RUN) { return cb() }
  var timer = datadog.timer('removeImage-' + this.dockURL)
  this.client.getImage(imageId).remove({ force: true }, function (err) {
    timer.stop()
    // TODO(bryan): this used to not bubble errors...
    setTimeout(function () { cb(err) }, intervalDelay)
  })
}

/**
 * Removes a specific container from a host
 * Stops & Removes the container
 * @param {string} containerId ID of the container to remove
 * @param {function} cb Callback function
 * @returns {null} null
 */
Docker.prototype.removeContainer = function (containerId, cb) {
  var self = this
  log.info({ containerId: containerId }, 'Docker.prototype.removeContainer')
  if (process.env.DRY_RUN) { return cb() }
  var timer = datadog.timer('removeContainer-' + this.dockURL)
  var container = this.client.getContainer(containerId)
  container.kill(function (err) {
    if (err) {
      log.error({
        err: err,
        containerId: containerId
      }, 'Docker.prototype.removeContainer kill error')
    }
    // TODO(bryan): where was this error going?
    log.trace({ containerId: containerId },
      'Docker.prototype.removeContainer kill success')
    self.removeStoppedContainer(containerId, function (rmErr) {
      if (rmErr) {
        log.error({
          err: rmErr,
          containerId: containerId,
          dockerHost: self.dockURL
        }, 'Docker.prototype.removeContainer remove error')
      }
      log.trace({ containerId: containerId },
        'Docker.prototype.removeContainer remove success')
      timer.stop()
      // TODO(bryan): this used to not bubble errors...
      setTimeout(function () { cb(rmErr) }, intervalDelay)
    })
  })
}

/**
 * Removes a stopped container
 * removes the container from image store on dock
 * @param {string} containerId ID of the container to remove
 * @param {function} cb Callback function
 * @returns {null} null
 */
Docker.prototype.removeStoppedContainer = function (containerId, cb) {
  var self = this
  log.info({ containerId: containerId },
    'Docker.prototype.removeStoppedContainer')
  if (process.env.DRY_RUN) { return cb() }
  var timer = datadog.timer('removeStoppedContainer-' + this.dockURL)
  var container = this.client.getContainer(containerId)
  container.remove(function (err) {
    if (err) {
      log.error({
        err: err,
        containerId: containerId,
        dockerHost: self.dockURL
      }, 'Docker.prototype.removeStoppedContainer remove error')
    }
    log.trace({
      containerId: containerId
    }, 'Docker.prototype.removeStoppedContainer remove success')
    timer.stop()
    // TODO(bryan): this used to not bubble errors...
    setTimeout(function () { cb(err) }, intervalDelay)
  })
}

/**
 * Pulls a docker image.
 * @param {string} image Name of the image to pull.
 * @return {Promise} Resolves when the image has been pulled.
 */
Docker.prototype.pull = function (image) {
  return Promise.fromCallback((cb) => {
    this.client.pull(image, (err, stream) => {
      if (err) { return cb(err) }
      // followProgress will return with an argument if error
      this.client.modem.followProgress(stream, cb)
    })
  })
}
