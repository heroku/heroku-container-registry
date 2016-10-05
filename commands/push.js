'use strict';

const cli = require('heroku-cli-util');
const co = require('co');
const child = require('child_process');
const log = require('../lib/log');
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const DOCKERFILE_REGEX = /\/Dockerfile(.\w*)?$/;

module.exports = function(topic) {
  return {
    topic: topic,
    command: 'push',
    description: 'Builds, then pushes a Docker image to deploy your Heroku app',
    needsApp: true,
    needsAuth: true,
    variableArgs: true,
    flags: [
      { name: 'verbose', char: 'v', hasValue: false }
    ],
    run: cli.command(co.wrap(push))
  };
};

function* push(context, heroku) {
  let herokuHost = process.env.HEROKU_HOST || 'heroku.com';
  let registry = `registry.${ herokuHost }`;
  let dockerfiles = getDockerfiles(context.cwd, true);
  let possibleJobs = getJobs(`${ registry }/${ context.app }`, context.args, dockerfiles);
  let jobs = chooseJobs(possibleJobs);

  if (!jobs.length) {
    cli.warn('No images to push');
    process.exit();
  }

  try {
    for (let job of jobs) {
      cli.log(`\n=== Building ${ job.name } (${ job.dockerfile })`);
      yield buildImage(job.dockerfile, job.resource, context.flags.verbose);
    }
  }
  catch (err) {
    cli.error(`Error: docker build exited with ${ err }`);
    cli.hush(err.stack || err);
    process.exit(1);
  }

  try {
    for (let job of jobs) {
      cli.log(`\n=== Pushing ${ job.name } (${ job.dockerfile })`);
      yield pushImage(job.resource, context.flags.verbose);
    }
  }
  catch (err) {
    cli.error(`Error: docker push exited with ${ err }`);
    cli.hush(err.stack || err);
    process.exit(1);
  }
}

function buildImage(dockerfile, resource, verbose) {
  return new Promise((resolve, reject) => {
    let cwd = path.dirname(dockerfile);
    let args = [ 'build', '-f', dockerfile, '-t', resource, cwd ];
    log(verbose, args);
    child.spawn('docker', args, { stdio: 'inherit' })
      .on('exit', (code, signal) => {
        if (signal || code) reject(signal || code);
        else resolve();
      });
  });
}

function pushImage(resource, verbose) {
  return new Promise((resolve, reject) => {
    let args = [ 'push', resource ];
    log(verbose, args);
    child.spawn('docker', args, { stdio: 'inherit' })
      .on('exit', (code, signal) => {
        if (signal || code) reject(signal || code);
        else resolve();
      });
  });
}

function getDockerfiles(dir, recursive) {
  let match = recursive ? '**/Dockerfile?(.)*' : 'Dockerfile?(.)*';
  let dockerfiles = glob.sync(match, { cwd: dir, nonull: false, nodir: true });
  return dockerfiles.map(file => path.join(dir, file));
}

function getJobs(resourceRoot, procs, dockerfiles) {
  return dockerfiles
    // convert all Dockerfiles into job Objects
    .map((dockerfile) => {
      let match = dockerfile.match(DOCKERFILE_REGEX);
      if (!match) return;
      let proc = (match[1] || '.web').slice(1);
      return {
        name: proc,
        resource: `${ resourceRoot }/${ proc }`,
        dockerfile: dockerfile,
        postfix: path.basename(dockerfile) === 'Dockerfile' ? 0 : 1,
        depth: path.normalize(dockerfile).split(path.sep).length
      };
    })
    // if process types have been specified, filter non matches out
    .filter(job => {
      return job && (!procs.length || procs.indexOf(job.name) !== -1);
    })
    // prefer closer Dockerfiles, then prefer Dockerfile over Dockerfile.web
    .sort((a, b) => {
      return a.depth - b.depth || a.postfix - b.postfix;
    })
    // group all Dockerfiles for the same process type together
    .reduce((jobs, job) => {
      jobs[job.name] = jobs[job.name] || [];
      jobs[job.name].push(job);
      return jobs;
    }, {});
}

function chooseJobs(jobs) {
  return Object.keys(jobs).map(name => {
    let group = jobs[name];
    if (group.length > 1) {
      let ambiguous = group.map(job => job.dockerfile);
      if (group[1].depth === group[0].depth) {
        if (group[1].postfix === group[0].postfix) {
          cli.error(`Cannot build.  More than one Dockerfile defines the process type:\n${ ambiguous.join('\n') }`);
          process.exit(1);
        }
      }
      cli.warn(`WARNING: Using nearest match for '${ group[0].name }' process type:`);
      cli.warn(`WARNING: ${ ambiguous[0] } (used)`);
      ambiguous.slice(1).forEach(file => cli.warn(`WARNING: ${ file } (ignored)`));
    }
    return group[0];
  });
}
