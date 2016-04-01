module.exports = [
  {
    $match: {
      'owner.github': {
        $ne: 'HelloRunnable'
      }
    }
  },
  {
    $project: {
      name: 1,
      shortHash: 1,
      orgId: '$owner.github',
      orgName: '$owner.username',
      context: '$contextVersion.context',
      isMasterPod: '$masterPod',
      isRepo: {
        $gt: [{
          $size: '$contextVersion.appCodeVersions'
        }, 0]
      },
      starting: '$container.inspect.State.Starting',
      stopping: '$container.inspect.State.Stopping',
      running: {
        $and: [
          { $eq: ['$container.inspect.State.Running', true] },
          { $not: '$container.inspect.State.Starting' },
          { $not: '$container.inspect.State.Stopping' }
        ]
      },
      neverStarted: {
        $and: [
          {
            $not: [
              {
                $and: [
                  { $eq: ['$container.inspect.State.Running', true] },
                  { $not: '$container.inspect.State.Starting' },
                  { $not: '$container.inspect.State.Stopping' }
                ]
              }
            ]
          },
          { $eq: ['$container.inspect.State.StartedAt', '0001-01-01T00:00:00Z'] }
        ]
      },
      buildFailed: {
        $and: [
          { $eq: ['$contextVersion.build.failed', true] },
          { $not: '$container' }
        ]
      },
      building: {
        $and: [
          '$contextVersion.build',
          {
            $not: [ // We aren't buildFailed
              {
                $and: [
                  { $eq: ['$contextVersion.build.failed', true] },
                  { $eq: ['$contextVersion.build.completed', true] }
                ]
              }
            ]
          },
          { $not: '$container' } // No Container
        ]
      },
      stopped: {
        $and: [
          { $eq: ['$container.inspect.State.ExitCode', 0] },
          { $not: ['$container.inspect.State.Running'] },
          { $ne: ['$container.inspect.State.StartedAt', '0001-01-01T00:00:00Z'] }
        ]
      },
      crashed: {
        $and: [
          { $ne: ['$container.inspect.State.ExitCode', 0] },
          { $not: ['$container.inspect.State.Running'] },
          {
            $not: [
              {
                $ifNull: ['$container', true]
              }
            ]
          }
        ]
      }
    }
  },
  {
    $project: {
      name: 1,
      shortHash: 1,
      orgId: 1,
      orgName: 1,
      context: 1,
      isMasterPod: 1,
      isRepo: 1,
      starting: 1,
      stopping: 1,
      running: 1,
      neverStarted: 1,
      buildFailed: 1,
      building: 1,
      stopped: 1,
      crashed: 1,
      unknown: {
        $not: {
          $or: [
            '$crashed',
            '$buildFailed',
            '$neverStarted',
            '$building',
            '$starting',
            '$stopping',
            '$running',
            '$stopped'
          ]
        }
      },
      isMigrating: {
        $and: [
          '$contextVersion.dockRemoved',
          {
            $not: [
              {
                $or: ['$crashed', '$stopped', '$stopping', '$buildFailed']
              }
            ]
          }
        ]
      }
    }
  },
  {
    $project: {
      name: 1,
      shortHash: 1,
      orgId: 1,
      orgName: 1,
      context: 1,
      isMasterPod: 1,
      isRepo: 1,
      starting: 1,
      stopping: 1,
      running: 1,
      neverStarted: 1,
      buildFailed: 1,
      building: 1,
      stopped: 1,
      crashed: 1,
      red: {
        $or: ['$crashed', '$buildFailed', '$neverStarted']
      },
      orange: {
        $or: ['$building', '$starting', '$isMigrating']
      },
      green: {
        $or: ['$stopping', '$running']
      },
      gray: {
        $or: ['$stopped', '$unknown']
      }
    }
  },
  {
    $project: {
      name: 1,
      shortHash: 1,
      orgId: 1,
      orgName: 1,
      context: 1,
      isMasterPod: 1,
      isRepo: 1,
      starting: {
        $cond: ['$starting', 1, 0]
      },
      stopping: {
        $cond: ['$stopping', 1, 0]
      },
      running: {
        $cond: ['$running', 1, 0]
      },
      neverStarted: {
        $cond: ['$neverStarted', 1, 0]
      },
      buildFailed: {
        $cond: ['$buildFailed', 1, 0]
      },
      building: {
        $cond: ['$building', 1, 0]
      },
      stopped: {
        $cond: ['$stopped', 1, 0]
      },
      crashed: {
        $cond: ['$crashed', 1, 0]
      },
      red: {
        $cond: ['$red', 1, 0]
      },
      orange: {
        $cond: ['$orange', 1, 0]
      },
      green: {
        $cond: ['$green', 1, 0]
      },
      gray: {
        $cond: ['$gray', 1, 0]
      },
      counter: {
        $literal: 1
      }
    }
  },
  {
    $sort: {
      isMasterPod: -1
    }
  },
  {
    $group: {
      _id: '$context',
      orgId: {
        $first: '$orgId'
      },
      orgName: {
        $first: '$orgName'
      },
      name: {
        $first: '$name'
      },
      shortHash: {
        $first: '$shortHash'
      },
      isRepo: {
        $first: '$isRepo'
      },
      masterRed: {
        $first: '$red'
      },
      masterOrange: {
        $first: '$orange'
      },
      masterGreen: {
        $first: '$green'
      },
      masterGray: {
        $first: '$gray'
      },
      avgRed: {
        $avg: '$red'
      },
      avgOrange: {
        $avg: '$orange'
      },
      avgGreen: {
        $avg: '$green'
      },
      avgGray: {
        $avg: '$gray'
      },
      sumRed: {
        $sum: '$red'
      },
      sumOrange: {
        $sum: '$orange'
      },
      sumGreen: {
        $sum: '$green'
      },
      sumGray: {
        $sum: '$gray'
      },
      total: {
        $sum: '$counter'
      },
      sumStarting: {
        $sum: '$starting'
      },
      sumStopping: {
        $sum: '$stopping'
      },
      sumRunning: {
        $sum: '$running'
      },
      sumNeverStarted: {
        $sum: '$neverStarted'
      },
      sumBuildFailed: {
        $sum: '$buildFailed'
      },
      sumBuilding: {
        $sum: '$building'
      },
      sumStopped: {
        $sum: '$stopped'
      },
      sumCrashed: {
        $sum: '$crashed'
      }
    }
  },
  {
    $project: {
      _id: 1,
      orgId: 1,
      orgName: 1,
      instances: {
        name: '$name',
        shortHash: '$shortHash',
        masterStatus: {
          green: '$masterGreen',
          red: '$masterRed',
          orange: '$masterOrange',
          gray: '$masterGray'
        },
        avgRed: '$avgRed',
        avgOrange: '$avgOrange',
        avgGreen: '$avgGreen',
        avgGray: '$avgGray',
        sumRed: '$sumRed',
        sumOrange: '$sumOrange',
        sumGreen: '$sumGreen',
        sumGray: '$sumGray',
        total: '$total',
        isRepo: '$isRepo',
        sumStarting: '$sumStarting',
        sumStopping: '$sumStopping',
        sumRunning: '$sumRunning',
        sumNeverStarted: '$sumNeverStarted',
        sumBuildFailed: '$sumBuildFailed',
        sumBuilding: '$sumBuilding',
        sumStopped: '$sumStopped',
        sumCrashed: '$sumCrashed'
      }
    }
  },
  {
    $group: {
      _id: '$orgId',
      orgName: {
        $first: '$orgName'
      },
      totalServers: {
        $sum: '$instances.total'
      },
      instances: {
        $addToSet: '$instances'
      }
    }
  }
]
