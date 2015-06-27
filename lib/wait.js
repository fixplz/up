var Q = require('q')
var K = require('kefir')

export function whenStream (stream, pred) {
    return Q.Promise((resolve, reject) => {
        stream.onValue(onValue)
        stream.onError(onError)

        function onValue (val) {
            if(pred != null ? pred(val) : true) {
                unsub()
                resolve(val)
            }
        }
        function onError (err) {
            unsub()
            reject(err)
        }

        function unsub() {
            stream.offValue(onValue)
            stream.offError(onError)
        }
    })
}
