/**
 * Common wrapped functions of debug module
 * @module lib/models/debug/debug
 */
'use strict';

var DebugModule = require('debug');

/**
 * Wrapper class of debug module API methods
 * ensures consistent invokation with common prefix
 * @class
 * @param {String} fileName
 */
function Debug (fileName) {
  var fileNameRegex = new RegExp(process.env.KHRONOS_FILE_NAME_REGEX);
  var prefix = fileNameRegex.exec(fileName)[0];
  this.debug = new DebugModule('khronos|'+prefix);
}

/**
 * Wrapped invokation of debug module API method
 * @param mixed
 * @return null
 */
Debug.prototype.log = function () {
  var args = Array.prototype.slice.call(arguments, 0);
  args.forEach(function (arg) {
    this.debug(arg);
  }.bind(this));
};

module.exports = function (fileName) {
  return new Debug(fileName);
};
