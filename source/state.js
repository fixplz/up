import L from 'lodash'
import Store from 'mini-store'
import watchStore from 'mini-store/watch-kefir'

export default class RunnerState {
    constructor () {
        this.units = new Store({})
        this.instances = new Store({})

        this.instanceCount = 1
    }

    getUnits () {
        return this.units.get()
    }

    getUnit (unitId) {
        return this.units.get()[unitId]
    }

    putUnit (unitId, def) {
        this.units.modify(state => ({ ...state, [unitId]: def }))
    }

    getInstances () {
        return this.instances.get()
    }

    modifyInstance (instId, func) {
        this.instances.modify(state => ({ ...state, [instId]: func(state[instId]) }))
    }

    markInstance (instId, marking) {
        this.modifyInstance(instId, state => ({ ...state, marking }))
    }

    watchInstance (instId) {
        return watchStore(this.instances).map(state => state[instId])
    }

    getLiveInstancesForUnit (unitId) {
        return L.filter(this.getInstances(),
            inst => inst.unitId == unitId && inst.procState != 'stopped')
    }

    addInstance (inst) {
        inst.id = this.instanceCount ++
        this.instances.modify(state => ({ ...state, [inst.id]: inst }))
        return inst
    }
}
