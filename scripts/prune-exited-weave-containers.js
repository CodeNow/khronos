/**
 * Find and remove all stopped weave containers
 * @module scripts/prune-exited-weave-containers
 */
'use strict';

// substrings of weave container names
var WEAVE_CONTAINER_NAMES = [
  /zettio\/weavetools/,
  /weaveworks\/weave/
];

var async = require('async');

var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);
var dockerModule = require('models/docker/docker');
var mavis = require('models/mavis/mavis')();

module.exports = function(finalCb) {
  var totalContainersCount = 0;
  datadog.startTiming('complete-prune-weave-containers');
  mavis.getDocks(function (err) {
    if (err) {
      debug.log(err);
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
        docker.getContainers.bind(docker, {status: 'exited'}, WEAVE_CONTAINER_NAMES),
        removeDeadWeaveContainersOnDock
      ], function (err) {
        if (err) {
          debug.log(err);
        }
        totalContainersCount += docker.containers.length;
        debug.log('completed dock:', dock);
        dockCb();
      });
      /**
       * Remove all containers found in docker API query
       */
      function removeDeadWeaveContainersOnDock(pruneCb) {
        async.eachSeries(docker.containers,
        function (container, eachCb) {
          debug.log('removing weave container: '+container.Id);
          docker.removeContainer(container.Id, function (err) {
            if (err) {
              debug.log(err);
            }
            eachCb();
          });
        },
        pruneCb);
      }
    },
    function finished () {
      debug.log('completed remove dead weave containers');
      debug.log([
        'found and removed',
        totalContainersCount,
        'dead weave containers'
      ].join(' '));
      debug.log('-----------------------------------------------------------------------');
      datadog.endTiming('complete-prune-weave-containers');
      finalCb();
    });
  }
};
