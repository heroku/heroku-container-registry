'use strict';

const cli = require('heroku-cli-util');
const co = require('co');
const child = require('child_process');
const semver = require('semver');

module.exports = function(topic) {
  return {
    topic: topic,
    command: 'login',
    flags: [{ name: 'verbose', char: 'v', hasValue: false }],
    description: 'Logs in to the Heroku Docker registry',
    needsApp: false,
    needsAuth: true,
    run: cli.command(co.wrap(login))
  };
};

function* login(context, heroku) {
  let herokuHost = process.env.HEROKU_HOST || 'heroku.com';
  let registry = `registry.${ herokuHost }`;
  let password = context.auth.password;

  try {
    let user = yield dockerLogin(registry, password, context.flags.verbose);
  }
  catch (err) {
    cli.error(`Error: docker login exited with ${ err }`);
  }
}

function dockerLogin(registry, password, verbose) {
  return dockerVersion().then((version) => {
    return new Promise((resolve, reject) => {
      let args = [
        'login',
        '--username=_',
        `--password=${ password }`,
        registry
      ];
      if (semver.lte(version, "1.10.0")) {
        args.splice(1, 0, '--email=_')
      }
      if (verbose) {
        console.log(['> docker'].concat(args).join(' '));
      }
      child.spawn('docker', args, { stdio: 'inherit' })
        .on('exit', (code, signal) => {
          if (signal || code) reject(signal || code);
          else resolve();
        });
    });
  });
}

function dockerVersion() {
  return new Promise((resolve, reject) => {
    let args = [
      'version',
      '--format',
      "'{{.Server.Version}}'"
    ];

    const version = child.spawn('docker', args, {})
    version.stdout.on('data', (data) => {
      if (data) {
        resolve(data.toString().slice(1, -1));
      } else {
        reject(new Error("Not output"));
      }
    });
    version.on('exit', (code, signal) => {
      if (signal || code) reject(signal || code);
    });
  });
}
