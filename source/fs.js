import FS from 'fs'

let dir = '/up'
let hubFile = '/up/hub'
let stateFile = '/up/state'

try { require('fs').mkdirSync(dir) } catch(err) {}

export default {
  dir,
  hubFile,
  stateFile,
  persist: {
    get() {
      try { return JSON.parse(FS.readFileSync(stateFile, 'utf8')) } catch(err) {}
    },
    put(val) {
      FS.writeFileSync(stateFile, JSON.stringify(val, null, 2))
    }
  },
}
