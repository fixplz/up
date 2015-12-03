import util from 'util'
import L from 'lodash'
import Table from 'cli-table2'
import colors from 'colors'


export let inspect = obj => util.inspect(obj, {depth: null, colors: true})

export let title = str => colors.bold('\n# ' + str + '\n')

export let table = (list, subformat = {}, truncate = {}) => {
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
