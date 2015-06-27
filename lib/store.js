import K from 'kefir'
import StoreBase from 'watchable-store'

export default function Store(initial) {
    var me = new StoreBase(initial)

    me.stream = function (key) {
        return K.stream((emitter) => {
            var watcher = (val) => emitter.emit(val)
            me.watch(key, watcher)
            emitter.emit(me.get(key))
            return () => me.unwatch(key, watcher)
        })
    }

    return me
}
