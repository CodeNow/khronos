/**
 * Remove any stopped debug containers
 *
 * @module scripts/cleanup-stopped-debug-containers
 */
'use strict';

var async = require('async');

var datadog = require('models/datadog/datadog')(__filename);
var dockerFactory = require('models/docker/docker');
var log = require('logger').getChild(__filename);
var mavis = require('models/mavis/mavis')();
var keypather = require('keypather')();

module.exports = function (completeCb) {
  log.info('cleanup-stopped-debug-containers start');
  datadog.startTiming('complete-cleanup-stopped-debug-containers');
  /* for each dock
   * - find allcontainers
   *   - with Label.type='debug-container'
   *   - that are stopped
   * - remove them all!
   */

  async.series([
    mavis.getDocks.bind(mavis),
    function removeDebugContainers (cb) {
        async.eachSeries(
          mavis.docks,
          function (dock, eachCb) {
            var docker = dockerFactory();
            docker.connect(dock);
            async.series([
              function getContainers (cb) {
                var queryOpts = {
                  filters: JSON.stringify({
                    label: 'type=debug-container',
                    status: 'exited'
                  }),
                };
                docker.getContainers(queryOpts, cb);
              },
              function deleteContainers (cb) {
                async.each(
                  docker.containers,
                  function (container, delCb) {
                    // sanity check
                    var type = keypather.get(container, 'Labels.type');
                    if (type !== 'debug-container') {
                      log.warn('received a debug container unexpectedly');
                      return cb();
                    }
                    docker.removeStoppedContainer(container.Id, delCb);
                  },
                  cb);
              }
            ], eachCb);
          },
          cb);
    }
  ], function (err) {
    if (err) {
      log.error({ err: err }, 'Error removing debug containers');
    }
    datadog.endTiming('complete-cleanup-stopped-debug-containers');
    completeCb(err);
  });
};
