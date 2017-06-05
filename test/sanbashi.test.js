let Sinon = require('sinon')
let Sanbashi = require('../lib/sanbashi')
let expect = require('chai').expect
let Path = require('path')
let Inquirer = require('inquirer')

describe('Sanbashi', () => {
  describe('.getDockerfiles', () => {
    it('can find in just the given directory', () => {
      const searchpath = Path.join(process.cwd(), './test/fixtures')
      let results = Sanbashi.getDockerfiles(searchpath, false)
      expect(results).to.have.members([`${searchpath}/Dockerfile.web`])
    })
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
  })
  describe('.getJobs', () => {
    it('returns objects representing jobs per Dockerfile', () => {
      const dockerfiles = [
        Path.join('.', 'Dockerfile.web'),
        Path.join('.', 'Nested', 'Dockerfile.web')
      ]
      const resourceRoot = 'rootfulroot'
      const results = Sanbashi.getJobs(resourceRoot, ['web'], dockerfiles)
      expect(results.web).to.have.property('length', 2)
      expect(results.web[0]).to.have.property('depth', 1, 'dockerfile', './Dockerfile.web', 'postfix', 1)
      expect(results.web[1]).to.have.property('depth', 2, 'dockerfile', './Nested/Dockerfile.web', 'postfix', 1)
    })
    it('filters out by process type', () => {
      const dockerfiles = [
        Path.join('.', 'Dockerfile.web'),
        Path.join('.', 'Nested', 'Dockerfile.worker'),
        Path.join('.', 'Dockerfile')
      ]
      const resourceRoot = 'rootfulroot'
      const results = Sanbashi.getJobs(resourceRoot, ['web'], dockerfiles)
      expect(results.web).to.have.property('length', 1)
      expect(results.web[0]).to.have.property('name', 'web')
      expect(results).to.not.have.property('worker')
    })
    it('sorts dockerfiles by directory depth, then proc type', () => {
      const dockerfiles = [
        Path.join('.', 'Nested', 'Dockerfile.worker'),
        Path.join('.', 'Dockerfile.web'),
        Path.join('.', 'Nested', 'Dockerfile')
      ]
      const resourceRoot = 'rootfulroot'
      const results = Sanbashi.getJobs(resourceRoot, ['web', 'standard', 'worker'], dockerfiles)
      expect(results.web).to.have.property('length', 1)
      expect(results.web[0]).to.have.property('dockerfile', 'Dockerfile.web')
      expect(results.standard[0]).to.have.property('dockerfile', 'Nested/Dockerfile')
      expect(results.worker[0]).to.have.property('dockerfile', 'Nested/Dockerfile.worker')
    })
    it('groups the jobs by process type', () => {
      const dockerfiles = [
        Path.join('.', 'Nested', 'Dockerfile.worker'),
        Path.join('.', 'Dockerfile.web'),
        Path.join('.', 'Nested', 'Dockerfile')
      ]
      const resourceRoot = 'rootfulroot'
      const results = Sanbashi.getJobs(resourceRoot, ['web', 'worker'], dockerfiles)
      expect(results).to.have.keys('worker', 'web')
      expect(results['worker'].map(j => j.dockerfile)).to.have.members([Path.join('.', 'Nested', 'Dockerfile.worker')])
      expect(results['web'].map(j => j.dockerfile)).to.have.members([Path.join('.', 'Dockerfile.web')])
    })
  })
  describe('.chooseJobs', () => {
    it('returns the entry when only one exists', async () => {
      const dockerfiles = [Path.join('.', 'Nested', 'Dockerfile.web')]
      const jobs = Sanbashi.getJobs('rootfulroot', ['web'], dockerfiles)
      let chosenJob = await Sanbashi.chooseJobs(jobs)
      expect(chosenJob[0]).to.have.property('dockerfile', dockerfiles[0])
      expect(chosenJob).to.have.property('length', 1)
    })
    it.skip('queries the user when more than one job of a type exists', () => {
      //really no way to simulate user input for Inquirer
      Sinon.stub(Inquirer, 'prompt').resolves('something')
      const dockerfiles = [
        Path.join('.', 'Nested', 'Dockerfile.web'),
        Path.join('.', 'OtherNested', 'Dockerfile.web'),
        Path.join('.', 'AnotherNested', 'Dockerfile.web', './Dockerfile.web')
      ]
      let jobs = Sanbashi.getJobs('rootfulroot', ['web'], dockerfiles)
      let res = Sanbashi.chooseJobs(jobs)
      //   .then((chosen) => {
      //     console.dir(chosen, {
      //       colors: true,
      //       depth: null
      //     })
      // })
      console.dir(res)
    })
    afterEach(() => {
      if (Inquirer.prompt.restore)
        Inquirer.prompt.restore()
    })
  })
})
