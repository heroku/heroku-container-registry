const cli = require('heroku-cli-util');
const child = require('child_process');
const log = require('../lib/log');

module.exports = function(topic) {
  return {
    topic: topic,
    command: 'logout',
    flags: [{ name: 'verbose', char: 'v', hasValue: false }],
    description: 'logs out from the Heroku Docker registry',
    help: `Usage:
       heroku container:logout`,
    needsApp: false,
    needsAuth: false,
    run: cli.command(logout)
  };
};

async function logout(context, heroku) {
  let herokuHost = process.env.HEROKU_HOST || 'heroku.com';
  let registry = `registry.${ herokuHost }`;

  try {
    let user = await dockerLogout(registry, context.flags.verbose);
  }
  catch (err) {
    cli.error(`Error: docker logout exited with ${ err }`);
  }
}

function dockerLogout(registry, verbose) {
  return new Promise((resolve, reject) => {
    let args = [
      'logout',
      registry
    ];
    log(verbose, args);
    child.spawn('docker', args, { stdio: 'inherit' })
      .on('exit', (code, signal) => {
        if (signal || code) reject(signal || code);
        else resolve();
      });
  });
}
