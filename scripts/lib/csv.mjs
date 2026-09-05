export function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false

  const source = text.replace(/^\uFEFF/, '')
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]

    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        value += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        value += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(value)
      value = ''
    } else if (character === '\n') {
      row.push(value.replace(/\r$/, ''))
      rows.push(row)
      row = []
      value = ''
    } else {
      value += character
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.replace(/\r$/, ''))
    rows.push(row)
  }

  if (rows.length === 0) return []
  const headers = rows[0]
  return rows.slice(1).filter((values) => values.some(Boolean)).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
  )
}
