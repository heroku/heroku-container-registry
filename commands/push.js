const cli = require('heroku-cli-util')
const Sanbashi = require('../lib/sanbashi')

let usage = `
  ${cli.color.bold.underline.magenta('Usage:')}
  ${ cli.color.white('heroku container:push web')}         	           # Pushes Dockerfile in current directory
  ${ cli.color.white('heroku container:push web worker')}     	           # Pushes Dockerfile.web and Dockerfile.worker found in the current directory
  ${ cli.color.white('heroku container:push web worker --recursive')}     # Pushes Dockerfile.web and Dockerfile.worker found in the current directory or subdirectories
  ${ cli.color.white('heroku container:push --recursive')}                # Pushes Dockerfile.* found in current directory or subdirectories`

module.exports = function (topic) {
  return {
    topic: topic,
    command: 'push',
    description: 'builds, then pushes Docker images to deploy your Heroku app',
    needsApp: true,
    needsAuth: true,
    variableArgs: true,
    help: usage,
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
    run: cli.command(push)
  }
}

let push = async function (context, heroku) {
  const recurse = !!context.flags.recursive
  if (context.args.length === 0 && !recurse) {
    cli.error(`Error: Requires either --recursive or one or more process types\n ${usage} `)
    process.exit(1)
  }
  let herokuHost = process.env.HEROKU_HOST || 'heroku.com'
  let registry = `registry.${ herokuHost }`
  let dockerfiles = Sanbashi.getDockerfiles(process.cwd(), recurse)
  let possibleJobs = Sanbashi.getJobs(`${ registry }/${ context.app }`, context.args, dockerfiles)
  let jobs = await Sanbashi.chooseJobs(possibleJobs)
  if (!jobs.length) {
    cli.warn('No images to push')
    process.exit(1)
  }

  try {
    for (let job of jobs) {
      cli.log(cli.color.bold.white.bgMagenta(`\n=== Building ${job.name} (${job.dockerfile})`))
      await Sanbashi.buildImage(job.dockerfile, job.resource, context.flags.verbose)
    }
  }
  catch (err) {
    cli.error(`Error: docker build exited with ${ err }`)
    cli.hush(err.stack || err)
    process.exit(1)
  }

  try {
    for (let job of jobs) {
      cli.log(cli.color.bold.white.bgMagenta(`\n=== Pushing  ${job.name}  (${job.dockerfile })`))
      await Sanbashi.pushImage(job.resource, context.flags.verbose)
    }
  }
  catch (err) {
    cli.error(`Error: docker push exited with ${ err }`)
    cli.hush(err.stack || err)
    process.exit(1)
  }
}
