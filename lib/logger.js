/**
 * @module lib/logger
 */
'use strict'

// external
var bunyan = require('bunyan')
var bsyslog = require('bunyan-syslog')
var keypather = require('keypather')()
var path = require('path')
var put = require('101/put')

var streams = []

streams.push({
  level: process.env.LOG_LEVEL,
  type: 'raw',
  // Defaults to attempting syslogd at 127.0.0.1:514
  stream: bsyslog.createBunyanStream({
    type: 'sys',
    facility: bsyslog.local7
  })
})

var serializers = put(bunyan.stdSerializers, {
  tx: function () {
    // TODO pull of log data
    return keypather.get(process.domain, 'runnableData')
  },
  req: function (req) {
    return {
      method: req.method,
      url: req.url,
      isInternalRequest: req.isInternalRequest
    }
  }
})

/**
 * Logger Generator
 * @class
 * @module khronos:logger
 * @return {object} Logger
 */
var logger = module.exports = bunyan.createLogger({
  name: 'khronos',
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
  return logger.child({ module: moduleName }, true)
}
