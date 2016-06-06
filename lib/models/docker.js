'use strict'

const Promise = require('bluebird')
const keypath = require('keypather')()
const DockerClient = require('@runnable/loki').Docker
const logger = require('logger').getChild(__filename)

var TEST_IMAGE_TAG = new RegExp('^' + process.env.KHRONOS_DOCKER_REGISTRY_REGEX +
  '\/[0-9]+\/[A-z0-9]+:[A-z0-9]+')

module.exports = class Docker extends DockerClient {
  /**
   * creates docker class
   * @param  {String} dockerUrl docker url format: 10.0.0.0:4242
   * @return {Docker} Docker instance
   */
  constructor (dockerUrl) {
    super({ host: dockerUrl, log: logger })
  }

  /**
   * Fetches all containers on a host and filters for subset
   * with pattern matching tags.
   * @param {Object}   queryOpts               - docker api query options
   * @param {Array}    imageBlacklist            - array of image filter RegExp objects (filter
   *                                               matching 1 or more)
   * @param {[String]} containerIdWhitelist - docker container ids that should removed
   *                                               from the returning list
   * @returns {Promise} resolves when the container list is ready
   * @resolves {[Containers]} List of containers the match the imageBlacklist, but
   */
  getContainers (queryOpts, imageBlacklist, containerIdWhitelist) {
    const log = logger.child({
      dock: this.dockerHost,
      queryOpts: queryOpts,
      imageFilters: imageBlacklist,
      containerIdsToFilterOut: containerIdWhitelist,
      method: 'getContainers'
    })
    log.info('getContainers call')
    return this.listContainersAsync()
      .then(function (containers) {
        log.trace({
          containersCount: containers.length
        }, 'getContainers listContainers success')
        if (imageBlacklist) {
          containers = containers.filter(function (container) {
            return imageBlacklist.some(function (filterRegExp) {
              return filterRegExp.test(container.Image)
            })
          })
        }
        if (containerIdWhitelist) {
          containers = containers.filter(function (container) {
            return containerIdWhitelist.every(function (containerId) {
              // If every image name fails to match, leave it in the list
              return containerId !== container.Id
            })
          })
        }
        log.trace({ containersCount: containers.length }, 'getContainers filtered length')
        return containers
      })
      .catch(function (err) {
        log.error({ err: err }, 'getContainers listContainers error')
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
   * @return {Promise}
   */
  getImages (minAgeSeconds, cb) {
    const log = logger.child({
      minAgeSeconds: minAgeSeconds,
      dock: this.dockerHost,
      method: 'getImages'
    })
    log.info('getImages call')
    return this.listImagesAsync({ all: true })
      .then(function (images) {
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
        }, 'getImages tagless images length')
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
        log.trace({ imagesLength: images.length }, 'getImages images length')
        return [images, taglessImages]
      })
      .catch(function (err) {
        log.error({ err: err }, 'listImages error')
        throw err
      })
  }

  /**
   * Removes a specific image from a host
   * @param {string} imageId ID of the image to remove
   * @param {function} cb Callback function
   * @returns {Promise}
   */
  removeImage (imageId) {
    const log = logger.child({
      imageId: imageId,
      method: 'removeImage'
    })
    log.info('removeImage call')
    if (process.env.DRY_RUN) { return Promise.resolve() }
    return Promise.fromCallback((cb) => {
      this.getImage(imageId).remove({ force: true }, cb)
    })
  }

  /**
   * Removes a specific container from a host
   * Stops & Removes the container
   * @param {string} containerId ID of the container to remove
   * @returns {Promise}
   */
  removeContainer (containerId) {
    const log = logger.child({
      containerId: containerId,
      dockerHost: this.dockerHost,
      method: 'removeContainer'
    })
    log.info('removeContainer call')
    if (process.env.DRY_RUN) { return Promise.resolve() }
    const self = this
    return this.killContainerAsync(containerId)
    .catch(function (err) {
      log.error({ err: err }, 'removeContainer kill error')
    })
    .finally(function () {
      return self.removeStoppedContainer(containerId)
    })
  }

  /**
   * Removes a stopped container
   * removes the container from image store on dock
   * @param {string} containerId ID of the container to remove
   * @returns {Promise}
   */
  removeStoppedContainer (containerId) {
    const log = logger.child({
      dockerHost: this.dockerHost,
      containerId: containerId,
      method: 'removeStoppedContainer'
    })
    log.info('removeStoppedContainer call')
    if (process.env.DRY_RUN) { return Promise.resolve() }
    return this.removeContainerAsync(containerId)
      .catch(function (err) {
        if (err) {
          log.error({ err: err }, 'removeStoppedContainer error')
        }
        throw err
      })
  }

  /**
   * Pulls a docker image.
   * @param {string} image Name of the image to pull.
   * @return {Promise} Resolves when the image has been pulled.
   */
  pull (image) {
    const log = logger.child({
      dockerHost: this.dockerHost,
      image: image,
      method: 'pull'
    })
    log.info('pull call')
    return this.pullAsync(image)
    .then((stream) => {
      // followProgress will return with an argument if error
      return Promise.fromCallback((cb) => {
        this.client.modem.followProgress(stream, cb)
      })
    })
  }

}
