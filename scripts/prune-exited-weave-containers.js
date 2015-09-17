/**
 * Find and remove all stopped weave containers
 * @module scripts/prune-exited-weave-containers
 */
'use strict';

// substrings of weave container names
var WEAVE_CONTAINER_NAMES = [
  /zettio\/weavetools/,
  /weaveworks\/weave/,
  /weaveworks\/weaveexec/
];

var Mavis = require('models/mavis');
var async = require('async');
var datadog = require('models/datadog')(__filename);
var Docker = require('models/docker');
var log = require('logger').getChild(__filename);

module.exports = {
  run: function (finalCb) {
    var mavis = new Mavis();
    datadog.startTiming('complete-prune-weave-containers');

    async.waterfall([
      mavis.getDocks.bind(mavis),
      module.exports._removeDeadWeaveContainers
    ], function (err) {
      if (err) {
        log.error({ err: err }, 'ERROR IN prune-exited-weave-containers');
        return finalCb(err);
      }
      log.info('Finished prune-exited-weave-containers');
      datadog.endTiming('complete-prune-weave-containers');
      finalCb();
    });
  },
  _removeDeadWeaveContainers: function (docks, cb) {
    async.each(docks, module.exports._cleanWeaveFromDock, cb);
  },
  _cleanWeaveFromDock: function (dock, cb) {
    var docker = new Docker(dock);
    async.waterfall([
      function getDockerContainers (cb) {
        // FIXME(bryan): don't filter in docker model
        var dockerOpts = {
          filters: JSON.stringify({ 'status': ['exited'] })
        };
        docker.getContainers(dockerOpts, WEAVE_CONTAINER_NAMES, cb);
      },
      function (containers, cb) {
        module.exports._removeDeadWeaveContainersOnDock(docker, containers, cb);
      }
    ], function (err) {
      if (err) {
        // FIXME(bryan): report the error, but don't call it back?
        log.error({ err: err }, '_cleanWeaveFromDock error');
        return cb(err);
      }
      log.trace({ dock: dock }, '_cleanWeaveFromDock completed');
      cb();
    });
  },
  _removeDeadWeaveContainersOnDock: function (docker, containers, cb) {
    async.eachSeries(
      containers,
      function (container, eachSeriesCallback) {
        log.trace({
          containerId: container.Id
        }, '_removeDeadWeaveContainersOnDock pre-remove request');
        docker.removeStoppedContainer(container.Id, function (err) {
          if (err) {
            log.error({
              containerId: container.Id
            }, '_removeDeadWeaveContainersOnDock removeStoppedContainer error');
          }
          log.trace({
            containerId: container.Id
          }, '_removeDeadWeaveContainersOnDock removeStoppedContainer success');
          eachSeriesCallback();
        });
      },
      cb);
  }
};
