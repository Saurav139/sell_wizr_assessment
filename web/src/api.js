const BASE = '/api'

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

export const api = {
  config: () => get('/config'),

  validate: (url, tableIndex) => post('/validate', { url, table_index: tableIndex }),

  startProducer: (req) => post('/producer/start', req),
  stopProducer: () => post('/producer/stop', {}),
  producerStatus: () => get('/producer/status'),

  startConsumer: (req) => post('/consumer/start', req),
  stopConsumer: () => post('/consumer/stop', {}),
  consumerStatus: () => get('/consumer/status'),

  query: (sql) => post('/query', { sql }),
  tables: () => get('/tables'),
  truncate: (table) => post('/truncate', { table }),
  topicTables: () => get('/topic-tables'),
}
