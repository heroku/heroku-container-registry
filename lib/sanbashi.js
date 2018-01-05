// 'sanbashi' is a word in Japanese that refers to a pier or dock, usually very large in size, such as found in Tokyo's O-daiba region

let Glob = require('glob')
let Path = require('path')
let Inquirer = require('inquirer')
let os = require("os")
const Child = require('child_process')
const log = require('./log')

const DOCKERFILE_REGEX = /\bDockerfile(.\w*)?$/
let Sanbashi = function () {}

Sanbashi.getDockerfiles = function (rootdir) {
  let dockerfiles = Glob.sync('./**/Dockerfile?(.)*', {
    cwd: rootdir,
    nonull: false,
    nodir: true
  })
  return dockerfiles.
    filter(df => df.match(/Dockerfile\.[\w]+/)).
    map(file => Path.join(rootdir, file))
}

Sanbashi.getJobs = function (resourceRoot, dockerfiles, processType) {
  return dockerfiles
  // convert all Dockerfiles into job Objects
    .map((dockerfile) => {
      let match = dockerfile.match(DOCKERFILE_REGEX)
      if (!match) return
      let proc = (match[1] || '.web').slice(1)
      let isDefault = match[1] == undefined

      return {
        name: proc,
        default: isDefault,
        resource: `${ resourceRoot }/${ isDefault ? processType : proc }`,
        dockerfile: dockerfile,
        postfix: Path.basename(dockerfile) === 'Dockerfile' ? 0 : 1,
        depth: Path.normalize(dockerfile).split(Path.sep).length
      }
    })
    // prefer closer Dockerfiles, then prefer Dockerfile over Dockerfile.web
    .sort((a, b) => {
      return a.depth - b.depth || a.postfix - b.postfix
    })
    // group all Dockerfiles for the same process type together
    .reduce((jobs, job) => {
      jobs[job.name] = jobs[job.name] || []
      jobs[job.name].push(job)
      return jobs
    }, {})
}

Sanbashi.chooseJobs = async function (jobs, recurse) {
  let chosenJobs = []
  for (let processType in jobs) {
    if (!recurse && chosenJobs.length > 0) {
      continue
    }

    let group = jobs[processType]
    if (group.length > 1) {
      let prompt = {
        type: 'list',
        name: processType,
        choices: group.map(j => j.dockerfile),
        message: `Found multiple Dockerfiles with process type ${processType}. Please choose one to build and push `
      }
      let answer = await Inquirer.prompt(prompt)
      chosenJobs.push(group.find(o => o.dockerfile === answer[processType]))
    } else {
      chosenJobs.push(group[0])
    }
  }
  return chosenJobs
}

Sanbashi.filterByProcessType = function (jobs, procs) {
  let filteredJobs = {}
  procs.forEach((processType) => {
    filteredJobs[processType] = jobs[processType]
  })
  return filteredJobs
}

Sanbashi.buildImage = function (dockerfile, resource, verbose, buildArg) {
  let cwd = Path.dirname(dockerfile)
  let args = ['build', '-f', dockerfile, '-t', resource]

  for (let i=0; i < buildArg.length; i++) {
    if (buildArg[i].length !== 0) {
      args.push('--build-arg')
      args.push(buildArg[i])
    }
  }

  args.push(cwd)
  log(verbose, args)
  return Sanbashi.cmd('docker', args)
}

Sanbashi.pushImage = function (resource, verbose) {
  let args = ['push', resource]
  log(verbose, args)
  return Sanbashi.cmd('docker', args)
}


Sanbashi.runImage = function (resource, command, port, verbose) {
  let args = ['run', '--user', os.userInfo().uid, '-e', `PORT=${port}`]
  if (command == '') {
    args.push(resource)
  } else {
    args.push('-it', resource, command)
  }
  log(verbose, args)
  return Sanbashi.cmd('docker', args)
}

Sanbashi.version = function () {
  return Sanbashi
      .cmd('docker', ['version', '-f', '{{.Client.Version}}'], {output: true})
      .then(version => version.split(/\./))
      .then(([major, minor]) => [major, minor]) // ensure exactly 2 components
}

Sanbashi.cmd = function (cmd, args, options = {}) {
  let stdio = [process.stdin, process.stdout, process.stderr]
  if (options.input) {
    stdio[0] = 'pipe'
  }
  if (options.output) {
    stdio[1] = 'pipe'
  }

  return new Promise((resolve, reject) => {
    let child = Child.spawn(cmd, args, {stdio: stdio})

    if (child.stdin) {
      child.stdin.end(options.input)
    }
    let stdout = undefined
    if (child.stdout) {
      stdout = ''
      child.stdout.on('data', (data) => {
        stdout += data.toString()
      })
    }
    child.on('exit', (code, signal) => {
        if (signal || code) reject(signal || code)
        else resolve(stdout)
      })
  })
}

module.exports = Sanbashi
