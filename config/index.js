var dotenv = require('dotenv');
dotenv.load();

var config = {
  network: require('./network'),
  settings: require('./settings')
};

config.network.host = process.env.HOST || config.network.host;
config.network.port = process.env.PORT || config.network.port;

module.exports = config;
