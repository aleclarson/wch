let path = require('path')
let os = require('os')

let WCH_DIR = path.join(os.homedir(), '.wch')
let SOCK_PATH = path.join(WCH_DIR, 'server.sock')

module.exports = {WCH_DIR, SOCK_PATH}
