const cli = require('heroku-cli-util')
const co = require('co')
let Sanbashi = require('../lib/sanbashi')

module.exports = function (topic) {
  return {
    topic: topic,
    command: 'push',
    description: 'Builds, then pushes a Docker image to deploy your Heroku app',
    needsApp: true,
    needsAuth: true,
    variableArgs: true,
    flags: [
      {
        name: 'verbose',
        char: 'v',
        hasValue: false
      },
      {
        name: 'recursive',
        char: 'R',
        hasValue: false
      }
    ],
    run: cli.command(co.wrap(push))
  }
}

function* push (context, heroku) {
  let herokuHost = process.env.HEROKU_HOST || 'heroku.com'
  let registry = `registry.${ herokuHost }`
  let dockerfiles = Sanbashi.getDockerfiles(process.cwd(), true)
  let possibleJobs = Sanbashi.getJobs(`${ registry }/${ context.app }`, context.args, dockerfiles)
  let jobs = yield Sanbashi.chooseJobs(possibleJobs)
  if (!jobs.length) {
    cli.warn('No images to push')
    process.exit()
  }

  try {
    for (let job of jobs) {
      cli.log(`\n=== Building ${ job.name } (${ job.dockerfile })`)
      yield Sanbashi.buildImage(job.dockerfile, job.resource, context.flags.verbose)
    }
  }
  catch (err) {
    cli.error(`Error: docker build exited with ${ err }`)
    cli.hush(err.stack || err)
    process.exit(1)
  }

  try {
    for (let job of jobs) {
      cli.log(`\n=== Pushing ${ job.name } (${ job.dockerfile })`)
      yield Sanbashi.pushImage(job.resource, context.flags.verbose)
    }
  }
  catch (err) {
    cli.error(`Error: docker push exited with ${ err }`)
    cli.hush(err.stack || err)
    process.exit(1)
  }
}
