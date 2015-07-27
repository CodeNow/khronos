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

var async = require('async');

var datadog = require('models/datadog/datadog')(__filename);
var dockerModule = require('models/docker/docker');
var log = require('logger').getChild(__filename);
var mavis = require('models/mavis/mavis')();

module.exports = function(finalCb) {
  var totalContainersCount = 0;
  datadog.startTiming('complete-prune-weave-containers');
  mavis.getDocks(function (err) {
    if (err) {
      log.error({
        err: err
      }, 'module.exports mavisGetDocks error');
      finalCb(err);
    }
    removeDeadWeaveContainers();
  });

  /**
   * Remove all dead weave containers
   */
  function removeDeadWeaveContainers() {
    async.each(mavis.docks,
    function (dock, dockCb) {
      var docker = dockerModule();
      docker.connect(dock);
      async.series([
        docker.getContainers.bind(docker, {
          filters: JSON.stringify({'status': ['exited']})
        }, WEAVE_CONTAINER_NAMES),
        removeDeadWeaveContainersOnDock
      ], function (err) {
        if (err) {
          log.error({
            err: err
          }, 'removeDeadWeaveContainers finalCb error');
        }
        else {
          log.trace({
            dock: dock
          }, 'removeDeadWeaveContainers completed');
        }
        totalContainersCount += docker.containers.length;
        dockCb();
      });
      /**
       * Remove all containers found in docker API query
       */
      function removeDeadWeaveContainersOnDock(pruneCb) {
        async.eachSeries(docker.containers,
        function (container, eachCb) {
          log.trace({
            containerId: container.Id
          }, 'removeDeadWeaveContainersOnDock pre-remove request');
          docker.removeStoppedContainer(container.Id, function (err) {
            if (err) {
              log.error({
                containerId: container.Id
              }, 'removeDeadWeaveContainersOnDock removeStoppedContainer error');
            }
            else {
              log.trace({
                containerId: container.Id
              }, 'removeDeadWeaveContainersOnDock removeStoppedContainer success');
            }
            eachCb();
          });
        },
        pruneCb);
      }
    },
    function finished () {
      log.info({
        totalContainersRemoved: totalContainersCount
      }, 'Finished prune-exited-weave-containers');
      datadog.endTiming('complete-prune-weave-containers');
      finalCb();
    });
  }
};
