import util from 'util'
import L from 'lodash'
import Table from 'cli-table2'
import colors from 'colors'

export let log = console.log

export let status = (status) => {
  log(status.message)
  log(status.success ? colors.green('ok') : colors.red('not ok'))
}

export let title = str => {
  log(colors.bold(`\n# ${str}\n`))
}

let inspect = obj => util.inspect(obj, {depth: null, colors: true})

export let formatTable = (list, subformat = {}, truncate = {}) => {
  list = L.filter(list)

  if(list.length == 0)
    return '(empty)'

  let keys = L.keys(list[L.keys(list)[0]])

  let t = new Table({
    head: keys,
    colWidths: L.map(keys, k => truncate[k]),
    chars: { 'top': '' , 'top-mid': '' , 'top-left': '' , 'top-right': ''
           , 'bottom': '' , 'bottom-mid': '' , 'bottom-left': '' , 'bottom-right': ''
           , 'left': '' , 'left-mid': '' , 'mid': '─' , 'mid-mid': '─┼─'
           , 'right': '' , 'right-mid': '' , 'middle': ' │ ' },
    style: { 'padding-left': 0, 'padding-right': 0 },
  })

  t.push(...L.map(list, item => L.map(item, (v,k) =>
    subformat[k] ? subformat[k](v)
    : L.isString(v) ? v
    : inspect(v)
    )))

  return t.toString()
}
