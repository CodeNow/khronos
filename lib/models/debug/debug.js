'use strict';

var DebugModule = require('debug');

function Debug (fileName) {
  var fileNameRegex = new RegExp(process.env.KHRONOS_FILE_NAME_REGEX);
  var prefix = fileNameRegex.exec(fileName)[0];
  this.debug = new DebugModule('khronos|'+prefix);
}

Debug.prototype.log = function () {
  var args = Array.prototype.slice.call(arguments, 0);
  args.forEach(function (arg) {
    this.debug(arg);
  }.bind(this));
};

module.exports = function (fileName) {
  return new Debug(fileName);
};
