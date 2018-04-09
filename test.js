require('coffeescript/register')

const tp = require('testpass')
tp.findTests(__dirname + '/spec', '.coffee')

