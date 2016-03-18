var log = require('./lib/tasks/canary/log')

process.env.API_SOCKET_SERVER = 'https://api.runnable-beta.com'
process.env.API_URL = 'https://api.runnable-beta.com'
process.env.CANARY_API_TOKEN = '881f21c73ea2e446002bfdd5cbd9276ebe7d20c6'
process.env.CANARY_LOGS_INSTANCE_ID = '56df2d09cdab945e005c8e55'
process.env.CANARY_LOG_TERMINAL_SLEEP = 2
log({
  id: 'fakeJobId'
})
  .then(function () {
    console.log('FINISHED!')
    process.exit()
  })
  .catch(function (err) {
    console.log('FAILED', err)
    process.exit()
  })
