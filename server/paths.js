let os = require('os')

let WCH_DIR = os.homedir() + '/.wch'

module.exports = {
  WCH_DIR,
  LOG_PATH: WCH_DIR + '/server.log',
  SOCK_PATH: WCH_DIR + '/server.sock',
}
