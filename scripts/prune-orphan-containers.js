/**
 * Prune containers from each dock if no corresponding instance document exists
 * @module scripts/prune-orphan-containers
 */
'use strict';

var async = require('async');
var equals = require('101/equals');
var findIndex = require('101/find-index');
var pluck = require('101/pluck');

var datadog = require('models/datadog/datadog')(__filename);
var debug = require('models/debug/debug')(__filename);
var dockerModule = require('models/docker/docker');
var mavis = require('models/mavis/mavis')();
var mongodb = require('models/mongodb/mongodb');

module.exports = function(finalCB) {
  var orphanedContainersCount = 0;
  var totalContainersCount = 0;
  datadog.startTiming('complete-prune-orphan-containers');
  // for each dock
    // find all containers with tag 'registry.runnable.io'
    // query mongodb instances and if any container is not in db, remove it from dock
  mavis.getDocks(function (err) {
    if (err) {
      debug.log(err);
      finalCB(err);
    }
    processOrphanContainers();
  });
  function processOrphanContainers () {
    async.each(mavis.docks,
    function (dock, dockCB) {
      debug.log('beginning dock:', dock);
      var docker = dockerModule();
      docker.connect(dock);
      async.series([
        docker.getContainers.bind(docker),
        fetchInstancesAndPrune
      ], function () {
        totalContainersCount += docker.containers.length;
        debug.log('completed dock:', dock);
        dockCB();
      });
      function fetchInstancesAndPrune (fetchCVCB) {
        // chunk check context versions in db for batch of 100 images
        var chunkSize = 100;
        var lowerBound = 0;
        var upperBound = Math.min(chunkSize, docker.containers.length);
        var containerSet = [];
        if (docker.containers.length) {
          containerSet = docker.containers.slice(lowerBound, upperBound);
        }
        /**
         * Chunk requests to mongodb to avoid potential memory/heap size issues
         * when working with large numbers of containers and instance documents
         */
        async.doWhilst(
          doWhilstIterator,
          function check () {
            lowerBound = upperBound;
            upperBound = Math.min(upperBound+chunkSize, docker.containers.length);
            containerSet = docker.containers.slice(lowerBound, upperBound);
            return containerSet.length;
          },
          fetchCVCB
        );
        function doWhilstIterator (doWhilstIteratorCB) {
          debug.log('fetching instances '+lowerBound+' - '+upperBound);
          /**
           * construct query for instances by iterating over each container
           */
          var query = {
            'container.dockerContainer': {
              '$in': containerSet.map(pluck('Id'))
            }
          };
          debug.log('query', query);
          mongodb.fetchInstances(query, function (err, instances) {
            if (err) { return doWhilstIteratorCB(err); }
            /**
             * The difference between the range (upperBound-lowerBound) and the number
             * of instances that were retrieved is the number of orphaned containers
             * that have just been discovered on the current dock.
             */
            var numberMissing = (upperBound - lowerBound) - instances.length;
            if (!numberMissing) {
              debug.log('all containers in set '+lowerBound+'-'+upperBound+' found, proceeding...');
              return doWhilstIteratorCB();
            }
            debug.log(numberMissing+' containers on box not in database, cleaning up...');
            // track total number of orphaned containers that were discovered in this cron iteration
            orphanedContainersCount += numberMissing;
            /**
             * determine which containers in containerSet do not have corresponding instances
             * by iterating over each container in containerSet, and searching through the retrieved
             * instance documents for a match. If no match found, this container is an
             * orphan.
             */
            var foundInstancesContainerIds = instances.map(pluck('container.dockerContainer'));
            async.eachSeries(containerSet,
            function (container, eachCB) {
              // have container, is it in the list of "foundInstancesContainerIds" ????
              if (-1 !== findIndex(foundInstancesContainerIds, equals(container.Id))) {
                // container has corresponding Instance, continue (not orphan)
                return eachCB();
              }
              debug.log('Instance not found for container: '+container.Id);
              docker.removeContainer(container.Id, eachCB);
            }, doWhilstIteratorCB);
          });
        }
      }
    }, function (err) {
      debug.log('completed prune-orphan-containers');
      debug.log('found & removed '+orphanedContainersCount+' orphaned containers of '+
                totalContainersCount+' total containers');
      debug.log('-----------------------------------------------------------------------');
      datadog.endTiming('complete-prune-orphan-images');
      finalCB(err);
    });
  }
};
