var pkg = require('./package.json');


module.exports = {
  topic: {
    topic: 'container',
    description: 'heroku container registry'
  },
  commands: [
    require('./commands/index')(pkg),
    require('./commands/login')(pkg.topic),
    require('./commands/logout')(pkg.topic),
    require('./commands/push')(pkg.topic)
  ]
};
