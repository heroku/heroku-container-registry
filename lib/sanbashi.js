// 'sanbashi' is a word in Japanese that refers to a pier or dock, usually very large in size, such as found in Tokyo's O-daiba region

let Glob = require('glob')
let Path = require('path')
let Inquirer = require('inquirer')
const Child = require('child_process')
const log = require('./log')

const DOCKERFILE_REGEX = /\bDockerfile(.\w*)?$/
let Sanbashi = function(){}

  Sanbashi.getDockerfiles = function(rootdir, recursive) {
    let match = recursive ? './**/Dockerfile?(.)*' : 'Dockerfile*'
    let dockerfiles = Glob.sync(match, {
      cwd: rootdir,
      nonull: false,
      nodir: true
    })
    if (recursive) {
      dockerfiles = dockerfiles.filter(df => df.match(/Dockerfile\.[\w]+/))
    }
    return dockerfiles.map(file => Path.join(rootdir, file))
  }

  Sanbashi.getJobs = function(resourceRoot, procs, dockerfiles) {
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

  Sanbashi.chooseJobs = async function(jobs) {
		let chosenJobs = []
		for(let processType in jobs){
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

  Sanbashi.buildImage = function(dockerfile, resource, verbose) {
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

  Sanbashi.pushImage = function(resource, verbose) {
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

module.exports = Sanbashi
