/**
 * @module lib/logger
 */
'use strict'

// external
const bunyan = require('bunyan')
const getNamespace = require('continuation-local-storage').getNamespace
const path = require('path')
const put = require('101/put')

const streams = []

streams.push({
  level: process.env.LOG_LEVEL,
  stream: process.stdout
})

var serializers = put(bunyan.stdSerializers, {
  tx: function () {
    let out
    try {
      out = {
        tid: getNamespace('ponos').get('tid')
      }
    } catch (e) {
      // cant do anything here
    }
    return out
  }
})

/**
 * Logger Generator
 * @class
 * @module khronos:logger
 * @return {object} Logger
 */
var logger = module.exports = bunyan.createLogger({
  name: process.env.APP_NAME,
  streams: streams,
  serializers: serializers,
  // DO NOT use src in prod, slow
  src: !!process.env.LOG_SRC,
  // default values included in all log objects
  environment: process.env.NODE_ENV
})

/**
 * Initiate and return child instance.
 * @param {string} moduleName Module name to include in logger.
 * @returns {object} Logger
 */
module.exports.getChild = function (moduleName) {
  moduleName = path.relative(process.cwd(), moduleName)
  return logger.child({ tx: true, module: moduleName }, true)
}
