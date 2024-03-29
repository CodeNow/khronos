'use strict'

// external
var async = require('async')
var crypto = require('crypto')

module.exports = {
  deleteAllImagesAndContainers: function (docker, cb) {
    async.parallel([
      module.exports.deleteAllImages.bind(null, docker),
      module.exports.deleteAllContainers.bind(null, docker)
    ], cb)
  },
  deleteAllImages: function (docker, cb) {
    docker.listImages(function (err, images) {
      if (err) { return cb(err) }
      async.each(images, function (image, eachCb) {
        docker.getImage(image.Id).remove(eachCb)
      }, cb)
    })
  },
  deleteAllContainers: function (docker, cb) {
    docker.listContainers({ all: true }, function (err, containers) {
      if (err) { return cb(err) }
      async.each(containers, function (container, cb) {
        docker.getContainer(container.Id).remove(cb)
      }, cb)
    })
  },
  getRandomImageName: function () {
    return process.env.KHRONOS_DOCKER_REGISTRY +
    '/' +
    (Math.random() * 999999 | 0) +
    '/' +
    randomHash().substr(0, 24) +
    ':' +
    randomHash().substr(0, 24)

    function randomHash () {
      var shasum = crypto.createHash('sha256').update(Math.random() + '')
      return shasum.digest('hex')
    }
  },
  createContainer: function (docker, image, cb) {
    docker.createContainer({ Image: image }, cb)
  },
  createWeaveContainers: function (docker, num, cb) {
    async.times(num, function (n, cb) {
      module.exports.createContainer(docker, 'zettio/weavetools:0.9.0', cb)
    }, cb)
  },
  createImageBuilderContainers: function (docker, num, cb) {
    async.times(num, function (n, cb) {
      var imageName = 'registry.runnable.com/runnable/image-builder:0.9.0'
      module.exports.createContainer(docker, imageName, cb)
    }, cb)
  },
  createRandomContainers: function (docker, num, cb) {
    async.times(num, function (n, cb) {
      module.exports.createContainer(
        docker,
        module.exports.getRandomImageName(),
        cb)
    }, cb)
  },
  createImage: function (docker, opts, cb) {
    docker.createImage(opts, function (err, res) {
      if (err) { return cb(err) }
      res.on('data', function () {})
      res.on('end', function () { cb() })
    })
  },
  listContainersAndAssert: function (docker, fn, cb) {
    async.retry(
      { times: 5, interval: 100 },
      function (retryCb) {
        docker.listContainers(function (err, containers) {
          if (err) { return retryCb(err) }
          try {
            fn(containers)
          } catch (err) {
            return retryCb(err)
          }
          retryCb()
        })
      },
      cb)
  },
  listImagesAndAssert: function (docker, fn, cb) {
    async.retry(
      { times: 5, interval: 100 },
      function (retryCb) {
        docker.listImages(function (err, images) {
          if (err) { return retryCb(err) }
          try {
            fn(images)
          } catch (err) {
            return retryCb(err)
          }
          retryCb()
        })
      },
      cb)
  }
}
