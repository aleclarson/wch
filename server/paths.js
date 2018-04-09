let os = require('os')

let WCH_DIR
if (process.env.NODE_ENV == 'test') {
  WCH_DIR = os.tmpdir() + '/.wch'
} else {
  WCH_DIR = os.homedir() + '/.wch'
}

module.exports = {
  WCH_DIR,
  LOG_PATH: WCH_DIR + '/debug.log',
  SOCK_PATH: WCH_DIR + '/server.sock',
}
