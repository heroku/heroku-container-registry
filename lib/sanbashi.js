let Glob = require('glob')
let Path = require('path')
let Inquirer = require('inquirer')
const Child = require('child_process')
const log = require('./log')

const DOCKERFILE_REGEX = /\/Dockerfile(.\w*)?$/
class Sanbashi {
  constructor () {}

  static getDockerfiles (rootdir, recursive) {
    let match = recursive ? './**/Dockerfile?(.)*' : 'Dockerfile*'
    let dockerfiles = Glob.sync(match, {
      cwd: rootdir,
      nonull: false,
      nodir: true
    })
    return dockerfiles.map(file => Path.join(rootdir, file))
  }

  static getJobs (resourceRoot, procs, dockerfiles) {
    return dockerfiles
    // convert all Dockerfiles into job Objects
      .map((dockerfile) => {
        let match = dockerfile.match(DOCKERFILE_REGEX)
        if (!match) return
        let proc = (match[1] || '.web').slice(1)
        return {
          name: proc,
          resource: `${ resourceRoot }/${ proc }`,
          dockerfile: dockerfile,
          postfix: Path.basename(dockerfile) === 'Dockerfile' ? 0 : 1,
          depth: Path.normalize(dockerfile).split(Path.sep).length
        }
      })
      // if process types have been specified, filter non matches out
      .filter(job => {
        return job && (!procs.length || procs.indexOf(job.name) !== -1)
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

  static chooseJobs (jobs) {
    return Object.keys(jobs).map(processType => {
      let group = jobs[processType]
      if (group.length > 1) {
        let prompt = {
          type: 'list',
          name: processType,
          choices: group.map(j => j.dockerfile),
          message: `Found multiple Dockerfiles with process type ${processType}. Please choose one to build and push `
        }
        return Inquirer.prompt(prompt)
          .then((answer) => {
              return group.find(o => o.dockerfile === answer.web)
            }
          )
      } else {
        return group[0]
      }
    })
  }

  static buildImage (dockerfile, resource, verbose) {
    return new Promise((resolve, reject) => {
      let cwd = Path.dirname(dockerfile)
      let args = ['build', '-f', dockerfile, '-t', resource, cwd]
      log(verbose, args)
      Child.spawn('docker', args, {
        stdio: 'inherit'
      })
        .on('exit', (code, signal) => {
          if (signal || code) reject(signal || code)
          else resolve()
        })
    })
  }

  static pushImage (resource, verbose) {
    return new Promise((resolve, reject) => {
      let args = ['push', resource]
      log(verbose, args)
      Child.spawn('docker', args, {
        stdio: 'inherit'
      })
        .on('exit', (code, signal) => {
          if (signal || code) reject(signal || code)
          else resolve()
        })
    })
  }
}

module.exports = Sanbashi
