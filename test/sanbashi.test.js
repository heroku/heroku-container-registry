let Sinon = require('sinon')
let Sanbashi = require('../lib/sanbashi')
let expect = require('chai').expect
let Path = require('path')
let Inquirer = require('inquirer')

describe('Sanbashi', () => {
  describe('.getDockerfiles', () => {
    it('can recurse the directory', () => {
      const searchpath = Path.join(process.cwd(), './test/fixtures')
      let results = Sanbashi.getDockerfiles(searchpath, true)
      expect(results).to.have.members([`${searchpath}/Dockerfile.web`, `${searchpath}/Nested/Dockerfile.web`])
    })
    it('when recursing, rejects dockerfiles that have no postfix in the name', () => {
      const searchpath = Path.join(process.cwd(), './test/fixtures')
      let results = Sanbashi.getDockerfiles(searchpath, true)
      expect(results).to.not.have.members([`${searchpath}/Dockerfile`])
    })
    it('returns only regular Dockerfiles when not recursing', () => {
      const searchpath = Path.join(process.cwd(), './test/fixtures/Nested')
      let results = Sanbashi.getDockerfiles(searchpath, false)
      expect(results).to.have.members([`${searchpath}/Dockerfile`])
    })
  })
  describe('.filterByProcessType', () => {
    it('returns an array of jobs only of the type requested', () => {
      const dockerfiles = [
        Path.join('.', 'Nested', 'Dockerfile.worker'),
        Path.join('.', 'Dockerfile.web'),
        Path.join('.', 'Nested', 'Dockerfile')
      ]
      const resourceRoot = 'rootfulroot'
      const jobs = Sanbashi.getJobs(resourceRoot, dockerfiles)
      const filteredJobs = Sanbashi.filterByProcessType(jobs, ['web'])
      expect(filteredJobs).to.have.property('web')
      expect(filteredJobs.web[0].name).to.equal('web')
    })
  })
  describe('.getJobs', () => {
    it('returns objects representing jobs per Dockerfile', () => {
      const dockerfiles = [
        Path.join('.', 'Dockerfile.web'),
        Path.join('.', 'Nested', 'Dockerfile.web')
      ]
      const resourceRoot = 'rootfulroot'
      const results = Sanbashi.getJobs(resourceRoot, dockerfiles)
      expect(results.web).to.have.property('length', 2)
      expect(results.web[0]).to.have.property('depth', 1, 'dockerfile', './Dockerfile.web', 'postfix', 1)
      expect(results.web[1]).to.have.property('depth', 2, 'dockerfile', './Nested/Dockerfile.web', 'postfix', 1)
    })
    it('sorts dockerfiles by directory depth, then proc type', () => {
      const dockerfiles = [
        Path.join('.', 'Nested', 'Dockerfile.worker'),
        Path.join('.', 'Dockerfile.web'),
        Path.join('.', 'Nested', 'Dockerfile.web')
      ]
      const resourceRoot = 'rootfulroot'
      const results = Sanbashi.getJobs(resourceRoot, dockerfiles)
      expect(results.web).to.have.property('length', 2)
      expect(results.web[0]).to.have.property('dockerfile', 'Dockerfile.web')
      expect(results.web[1]).to.have.property('dockerfile', 'Nested/Dockerfile.web')
      expect(results.worker[0]).to.have.property('dockerfile', 'Nested/Dockerfile.worker')
    })
    it('uses given process type', () => {
      const dockerfiles = [
        Path.join('.', 'Nested', 'Dockerfile')
      ]
      const resourceRoot = 'rootfulroot'
      const results = Sanbashi.getJobs(resourceRoot, dockerfiles, 'worker')
      expect(results.worker).to.have.property('length', 1)
      expect(results.worker[0]).to.have.property('dockerfile', 'Nested/Dockerfile')
    })
    it('fallbacks to the "web" process type', () => {
      const dockerfiles = [
        Path.join('.', 'Nested', 'Dockerfile')
      ]
      const resourceRoot = 'rootfulroot'
      const results = Sanbashi.getJobs(resourceRoot, dockerfiles)
      expect(results.web).to.have.property('length', 1)
      expect(results.web[0]).to.have.property('dockerfile', 'Nested/Dockerfile')
    })
    it('groups the jobs by process type', () => {
      const dockerfiles = [
        Path.join('.', 'Nested', 'Dockerfile.worker'),
        Path.join('.', 'Dockerfile.web'),
        Path.join('.', 'Nested', 'Dockerfile.web'),
      ]
      const resourceRoot = 'rootfulroot'
      const results = Sanbashi.getJobs(resourceRoot, dockerfiles)
      expect(results).to.have.keys('worker', 'web')
      expect(results['worker'].map(j => j.dockerfile)).to.have.members([Path.join('.', 'Nested', 'Dockerfile.worker')])
      expect(results['web'].map(j => j.dockerfile)).to.have.members([Path.join('.', 'Dockerfile.web'), Path.join('.', 'Nested', 'Dockerfile.web')])
    })
  })
  describe('.chooseJobs', () => {
    it('returns all entries recursively', async () => {
      const dockerfiles = [Path.join('.', 'Nested', 'Dockerfile.web'), Path.join('.', 'Nested', 'Dockerfile.worker')]
      const jobs = Sanbashi.getJobs('rootfulroot', dockerfiles)
      let chosenJob = await Sanbashi.chooseJobs(jobs)
      expect(chosenJob[0]).to.have.property('dockerfile', dockerfiles[0])
      expect(chosenJob[1]).to.have.property('dockerfile', dockerfiles[1])
      expect(chosenJob).to.have.property('length', 2)
    })

    it('returns the entry when only one exists', async () => {
      const dockerfiles = [Path.join('.', 'Nested', 'Dockerfile.web')]
      const jobs = Sanbashi.getJobs('rootfulroot', dockerfiles)
      let chosenJob = await Sanbashi.chooseJobs(jobs)
      expect(chosenJob[0]).to.have.property('dockerfile', dockerfiles[0])
      expect(chosenJob).to.have.property('length', 1)
    })

    it('returns only entries of given type', async () => {
      const dockerfiles = [Path.join('.', 'Nested', 'Dockerfile.web'), Path.join('.', 'Nested', 'Dockerfile.worker')]
      const jobs = Sanbashi.getJobs('rootfulroot', dockerfiles)
      let chosenJob = await Sanbashi.chooseJobs(jobs, 'web')
      expect(chosenJob[0]).to.have.property('dockerfile', dockerfiles[0])
      expect(chosenJob).to.have.property('length', 1)
    })

    afterEach(() => {
      if (Inquirer.prompt.restore)
        Inquirer.prompt.restore()
    })
  })
  describe('.buildImage', () => {
    let path = Path.join(process.cwd(), './test/fixtures')
    let dockerfile = Path.join(path, 'Dockerfile.web')
    let resource = 'web'

    it('set build-time variables', () => {
      let buildArg = ['ENV=live', 'HTTPS=on']
      let cmd = Sinon.stub(Sanbashi, 'cmd')
      Sanbashi.buildImage(dockerfile, resource, false, buildArg)
      let dockerArg = ['build', '-f', dockerfile, '-t', 'web', '--build-arg', 'ENV=live', '--build-arg', 'HTTPS=on', path]
      Sinon.assert.calledWith(cmd, 'docker', dockerArg);
    })

    it('skip build-time variables if empty', () => {
      let buildArg = ['']
      let cmd = Sinon.stub(Sanbashi, 'cmd')
      Sanbashi.buildImage(dockerfile, resource, false, buildArg)
      let dockerArg = ['build', '-f', dockerfile, '-t', 'web', path]
      Sinon.assert.calledWith(cmd, 'docker', dockerArg);
    })

    afterEach(() => {
      Sanbashi.cmd.restore() // Unwraps the spy
    });
  })
  describe('.version', () => {
    it('returns a major and a minor component', async () => {
      let version = await Sanbashi.version()
      expect(version).to.have.property('length', 2)
      expect(version[0]).to.not.be.an('undefined')
      expect(version[1]).to.not.be.an('undefined')
    })
  })
})
