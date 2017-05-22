const cli = require('heroku-cli-util')
const child = require('child_process')
const log = require('../lib/log')

module.exports = function (topic) {
  return {
    topic: topic,
    command: 'login',
    flags: [{name: 'verbose', char: 'v', hasValue: false}],
    description: 'logs in to the Heroku Container Registry',
    help: `Usage:
        heroku container:login`,
    needsApp: false,
    needsAuth: true,
    run: cli.command(login)
  }
}

async function login (context, heroku) {
  let herokuHost = process.env.HEROKU_HOST || 'heroku.com'
  let registry = `registry.${ herokuHost }`
  let password = context.auth.password

  try {
    let user = await dockerLogin(registry, password, context.flags.verbose)
  }
  catch (err) {
    cli.error(`Error: docker login exited with ${ err }`)
    cli.hush(err.stack || err)
  }
}

function dockerLogin (registry, password, verbose) {
  return new Promise((resolve, reject) => {
    let args = [
      'login',
      '--username=_',
      `--password=${ password }`,
      registry
    ]
    log(verbose, args)
    child.spawn('docker', args, {stdio: 'inherit'})
      .on('exit', (code, signal) => {
        if (signal || code) reject(signal || code)
        else resolve()
      })
  })
}
