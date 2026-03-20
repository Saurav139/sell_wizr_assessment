import { useEffect, useState } from 'react'
import { api } from '../api'
import { LogStream } from '../components/LogStream'

export function ConsumerPage({ tableName: producedTable, streamedTopic }) {
  const [status, setStatus]             = useState('idle')
  const [rowsInserted, setRowsInserted] = useState(0)
  const [dupsSkipped, setDupsSkipped]   = useState(0)
  const [table, setTable]               = useState('')
  const [batchSize, setBatchSize]       = useState(25)
  const [resetOffset] = useState(false)
  const [tables, setTables]             = useState([])
  const [activeTable, setActiveTable]   = useState(null)
  const [streamActive, setStreamActive] = useState(false)
  const [error, setError]               = useState('')
  const [sql, setSql]                   = useState(producedTable ? `SELECT * FROM \`${producedTable}\` LIMIT 20` : 'SELECT * FROM my_table LIMIT 20')
  const [queryResult, setQueryResult]   = useState(null)
  const [queryError, setQueryError]     = useState('')
  const [queryLoading, setQueryLoading] = useState(false)
  const [cfg, setCfg]                   = useState(null)
  const [selectedTopic, setSelectedTopic] = useState(streamedTopic ?? '')
  const [topicTables, setTopicTables]   = useState({})

  const fetchTables = async () => {
    try { const d = await api.tables(); setTables(d.tables || []) } catch {}
  }
  const fetchTopicTables = async () => {
    try { const d = await api.topicTables(); setTopicTables(d || {}) } catch {}
  }

  useEffect(() => {
    fetchTables()
    fetchTopicTables()
    api.config().then(c => {
      setCfg(c)
      if (!streamedTopic) setSelectedTopic(c.kafka_topics?.[0] ?? '')
    }).catch(() => {})
    if (producedTable) setActiveTable(producedTable)
  }, [])

  useEffect(() => {
    if (activeTable) setSql(`SELECT * FROM \`${activeTable}\` LIMIT 20`)
  }, [activeTable])

  useEffect(() => {
    if (status !== 'running') return
    const t = setInterval(async () => {
      try {
        const d = await api.consumerStatus()
        setStatus(d.status); setRowsInserted(d.rows_inserted || 0); setDupsSkipped(d.dups_skipped || 0); setTable(d.table || '')
        if (d.status !== 'running') { setStreamActive(false); fetchTables(); clearInterval(t) }
      } catch {}
    }, 1500)
    return () => clearInterval(t)
  }, [status])

  const start = async () => {
    setError(''); setRowsInserted(0); setDupsSkipped(0)
    try {
      await api.startConsumer({
        kafka_brokers: cfg?.kafka_brokers ?? ['localhost:9092'],
        kafka_topic: selectedTopic,
        consumer_group: 'table-consumer-ui',
        db_dsn: cfg?.db_dsn ?? 'root:@tcp(localhost:3306)/tabledata?parseTime=true',
        batch_size: batchSize,
        reset_offset: resetOffset,
      })
      setStatus('running'); setStreamActive(true)
    } catch (e) { setError(e.message) }
  }

  const stop = async () => {
    try { await api.stopConsumer(); setStatus('idle'); setStreamActive(false); fetchTables() }
    catch (e) { setError(e.message) }
  }

  const runQuery = async () => {
    setQueryLoading(true); setQueryError(''); setQueryResult(null)
    try { setQueryResult(await api.query(sql)) }
    catch (e) { setQueryError(e.message) }
    finally { setQueryLoading(false) }
  }

  const isRunning = status === 'running'
  const isDone    = status === 'done'

  return (
    <div style={{ display: 'flex', height: '100%' }}>

      {/* ── Main ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '40px 48px', borderLeft: '1px solid rgba(201,162,39,0.25)', borderRight: '1px solid rgba(201,162,39,0.25)' }}>
        <div style={{ marginBottom: 12 }}>
          <span className="t-label" style={{ fontSize: 13, color: '#C9A227', letterSpacing: '0.2em' }}>STEP 04  CONSUME</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <h1 className="t-heading" style={{ fontSize: 48, color: '#FFFFFF', lineHeight: 1.05 }}>Consume &amp; Query</h1>
          <ConsumerBadge status={status} />
        </div>

        <p style={{ fontSize: 13, color: '#4A4D6A', marginBottom: 32, fontFamily: 'Barlow Condensed', letterSpacing: '0.04em' }}>
          TOPIC <span style={{ color: '#C9A227' }}>{selectedTopic || 'none selected'}</span>
          {producedTable && <>{' · '}TABLE <span style={{ color: '#C9A227' }}>{producedTable}</span></>}
          {'  ·  '}
          DSN <span style={{ color: '#C9A227' }}>{cfg?.db_dsn ? cfg.db_dsn.replace(/^[^@]*@/, '') : 'localhost:3306'}</span>
        </p>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 32 }}>
          {!isRunning && (
            <button className="btn-primary" onClick={start} style={{ padding: '11px 24px', fontSize: 12 }}>▶ Start Consumer</button>
          )}
          {isRunning && (
            <button className="btn-danger" onClick={stop} style={{ padding: '11px 20px', fontSize: 12 }}>■ Stop</button>
          )}
        </div>

        {error && <ErrorBox>{error}</ErrorBox>}

        {/* Gauge readouts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, marginBottom: 32, border: '1px solid rgba(255,255,255,0.06)' }}>
          <Gauge n={rowsInserted} label="ROWS INSERTED"     glow={isRunning || isDone} />
          <Gauge n={dupsSkipped} label="DUPLICATES SKIPPED" divider />
          <Gauge n={batchSize}           label="BATCH SIZE"         divider />
        </div>

        {/* Progress bar */}
        {(isRunning || isDone) && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="t-label" style={{ fontSize: 9, color: '#4A4D6A' }}>PROGRESS</span>
              <span className="t-label" style={{ fontSize: 9, color: isDone ? '#C9A227' : '#7B7E9A' }}>{isDone ? '100%' : 'CONSUMING…'}</span>
            </div>
            <div style={{
              height: 8,
              background: 'linear-gradient(90deg, #0D0F1A 0%, #111326 100%)',
              boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.5), inset -1px -1px 2px rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{
                height: '100%',
                background: isDone ? 'linear-gradient(90deg,#B8921E,#C9A227)' : 'linear-gradient(90deg,#3A3010,#C9A227,#B8921E)',
                boxShadow: isDone ? '0 0 12px rgba(201,162,39,0.5)' : '0 0 8px rgba(201,162,39,0.3)',
                width: isDone ? '100%' : '68%',
                transition: 'width 0.6s ease',
              }} />
            </div>
          </div>
        )}


        {/* Live log */}
        <div className="t-label" style={{ fontSize: 10, color: '#4A4D6A', letterSpacing: '0.18em', marginBottom: 8 }}>LOGS VIEW</div>
        <LogStream endpoint="/api/consumer/stream" active={streamActive} />

        {/* Divider */}
        <div style={{ margin: '32px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }} />

        {/* Query section */}
        <div className="t-label" style={{ fontSize: 10, color: '#C9A227', letterSpacing: '0.18em', marginBottom: 16 }}>QUERY MYSQL</div>

        {/* SQL terminal */}
        <div style={{
          background: '#080916',
          border: '1px solid rgba(201,162,39,0.1)',
          boxShadow: 'inset 3px 3px 10px rgba(0,0,0,0.7), inset -1px -1px 2px rgba(255,255,255,0.01)',
          marginBottom: 12,
          padding: '14px 16px',
          position: 'relative',
        }}>
          {/* Terminal header dots */}
          <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#2E3160' }} />
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#2E3160' }} />
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(201,162,39,0.4)' }} />
          </div>
          <textarea
            style={{
              width: '100%', height: 90, background: 'transparent',
              border: 'none', outline: 'none', resize: 'none',
              fontFamily: 'Barlow Condensed', fontSize: 12, lineHeight: 1.7,
              color: '#C9A227', caretColor: '#C9A227', letterSpacing: '0.03em',
            }}
            value={sql}
            onChange={e => setSql(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runQuery() }}
            spellCheck={false}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <button className="btn-primary" onClick={runQuery} disabled={queryLoading} style={{ padding: '10px 22px', fontSize: 12 }}>
            {queryLoading ? 'Running…' : 'Run Query'}
          </button>
        </div>

        {queryError && <ErrorBox>{queryError}</ErrorBox>}

        {/* Query results */}
        {queryResult && (
          <div style={{ marginBottom: 24 }}>
            <div style={{
              background: 'linear-gradient(160deg, #1C1E32 0%, #181A2E 100%)',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            }}>
              {/* Column headers */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: queryResult.columns.map(() => '1fr').join(' '),
                padding: '8px 16px',
                background: 'linear-gradient(180deg, #22244A 0%, #1E2042 100%)',
                borderBottom: '1px solid rgba(201,162,39,0.1)',
              }}>
                {queryResult.columns.map(c => (
                  <span key={c} className="t-label" style={{ fontSize: 9, color: '#C9A227', opacity: 0.7 }}>
                    {c.toUpperCase()}
                  </span>
                ))}
              </div>
              {/* Rows */}
              {(queryResult.rows || []).map((row, i) => (
                <div key={i} style={{
                  display: 'grid',
                  gridTemplateColumns: queryResult.columns.map(() => '1fr').join(' '),
                  padding: '0 16px',
                  height: 36,
                  alignItems: 'center',
                  background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                }}>
                  {row.map((cell, j) => (
                    <span key={j} style={{
                      fontFamily: 'Barlow Condensed', fontSize: 11, color: '#A0A3B8',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12,
                    }}>{cell ?? ''}</span>
                  ))}
                </div>
              ))}
            </div>
            <div className="t-label" style={{ fontSize: 9, color: '#4A4D6A', marginTop: 8, letterSpacing: '0.1em' }}>
              {queryResult.rows?.length ?? 0} ROWS RETURNED
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel ── */}
      <RightPanel>
        <PanelSection title="Kafka Topic" />

        {/* Topic selector */}
        <select
          value={selectedTopic}
          onChange={e => setSelectedTopic(e.target.value)}
          disabled={isRunning}
          style={{
            width: '100%', background: '#0A0C1A', border: '1px solid rgba(201,162,39,0.2)',
            color: '#C9A227', fontFamily: 'Barlow Condensed', fontSize: 12,
            padding: '7px 10px', outline: 'none', cursor: isRunning ? 'not-allowed' : 'pointer',
            opacity: isRunning ? 0.4 : 1, marginBottom: 16,
          }}
        >
          {(cfg?.kafka_topics ?? []).filter(Boolean).map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Tables produced to this topic */}
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Barlow Condensed', fontSize: 9, color: '#4A4D6A', letterSpacing: '0.12em' }}>PRODUCED TABLES</span>
          <button onClick={fetchTopicTables} style={{ fontFamily: 'Barlow Condensed', fontSize: 9, color: '#C9A227', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7 }}>↻</button>
        </div>
        {(topicTables[selectedTopic] ?? []).length === 0
          ? <p style={{ fontFamily: 'Barlow Condensed', fontSize: 10, color: '#2E3160', marginBottom: 16 }}>No tables produced yet</p>
          : <div style={{ marginBottom: 20 }}>
              {(topicTables[selectedTopic] ?? []).map(name => {
                const mysqlRow = tables.find(t => t.name === name)
                return (
                  <div key={name}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <button
                        onClick={() => setActiveTable(name)}
                        style={{
                          flex: 1, textAlign: 'left', padding: '10px 0',
                          background: activeTable === name ? 'rgba(201,162,39,0.05)' : 'transparent',
                          border: 'none', cursor: 'pointer',
                          borderLeft: activeTable === name ? '2px solid rgba(201,162,39,0.6)' : '2px solid transparent',
                          paddingLeft: activeTable === name ? 10 : 0,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ fontFamily: 'Barlow', fontSize: 12, color: activeTable === name ? '#C9A227' : '#A0A3B8', fontWeight: 500 }}>{name}</div>
                        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 10, color: '#4A4D6A', marginTop: 1 }}>
                          {mysqlRow ? `${mysqlRow.row_count?.toLocaleString()} rows` : 'not yet consumed'}
                        </div>
                      </button>
                      {mysqlRow && (
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Clear all rows from "${name}"?`)) return
                            await api.truncate(name)
                            fetchTables()
                            fetchTopicTables()
                          }}
                          title="Clear table"
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontFamily: 'Barlow Condensed', fontSize: 10, color: '#2E3160',
                            padding: '4px 6px', flexShrink: 0, transition: 'color 0.15s',
                          }}
                          onMouseOver={e => e.target.style.color = '#EF4444'}
                          onMouseOut={e => e.target.style.color = '#2E3160'}
                        >CLEAR</button>
                      )}
                    </div>
                    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} />
                  </div>
                )
              })}
            </div>
        }

        <div style={{ marginTop: 8 }}>
          <PanelSection title="Consumer Config" />
          <PanelRow k="BROKER"   v={cfg?.kafka_brokers?.join(', ') ?? ':9092'} />
          <PanelRow k="GROUP"    v="table-consumer-ui" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ fontFamily: 'Barlow Condensed', fontSize: 10, color: '#4A4D6A', letterSpacing: '0.1em', textTransform: 'uppercase' }}>BATCH SIZE</span>
            <input
              type="number" min={1} max={500}
              value={batchSize}
              onChange={e => setBatchSize(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={isRunning}
              style={{
                width: 60, background: '#0A0C1A', border: '1px solid rgba(201,162,39,0.2)',
                color: '#C9A227', fontFamily: 'Barlow Condensed', fontSize: 11,
                padding: '2px 6px', textAlign: 'right', outline: 'none',
                opacity: isRunning ? 0.4 : 1,
              }}
            />
          </div>
        </div>
      </RightPanel>
    </div>
  )
}

/* ── Consumer status badge ── */
function ConsumerBadge({ status }) {
  if (status === 'idle') return null
  const isRunning = status === 'running'
  return (
    <div style={{
      position: 'relative', marginTop: 8,
      display: 'inline-flex', alignItems: 'center', gap: 7,
      padding: '6px 12px',
      background: isRunning ? 'linear-gradient(135deg,#2A2200,#1E1800)' : 'linear-gradient(135deg,#221E00,#181400)',
      border: `1px solid ${isRunning ? 'rgba(201,162,39,0.3)' : 'rgba(201,162,39,0.2)'}`,
      boxShadow: isRunning ? '0 0 0 1px rgba(201,162,39,0.1), 0 0 16px rgba(201,162,39,0.15)' : 'none',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: -4, left: '15%', width: '25%', height: '70%', background: 'radial-gradient(ellipse, rgba(201,162,39,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: isRunning ? '#C9A227' : '#B8921E', boxShadow: isRunning ? '0 0 6px rgba(201,162,39,0.9), 0 0 12px rgba(201,162,39,0.4)' : 'none', animation: isRunning ? 'pulse 2s ease-in-out infinite' : 'none' }} />
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
      <span className="t-label" style={{ fontSize: 9, color: '#C9A227', letterSpacing: '0.15em' }}>{isRunning ? 'RUNNING' : '✓ DONE'}</span>
    </div>
  )
}

/* ── Gauge readout ── */
function Gauge({ n, label, glow, divider }) {
  return (
    <div style={{
      padding: '20px 20px 16px',
      background: 'linear-gradient(160deg, #1C1E32 0%, #181A2E 100%)',
      borderLeft: divider ? '1px solid rgba(255,255,255,0.05)' : 'none',
      position: 'relative', overflow: 'hidden',
    }}>
      {glow && <div style={{ position: 'absolute', top: 0, left: '10%', width: '40%', height: '50%', background: 'radial-gradient(ellipse, rgba(201,162,39,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />}
      <div style={{
        fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 32, lineHeight: 1, marginBottom: 6,
        color: glow ? '#C9A227' : '#D0D2E0',
        textShadow: glow ? '0 0 20px rgba(201,162,39,0.6), 0 0 40px rgba(201,162,39,0.25)' : 'none',
      }}>{n}</div>
      <div className="t-label" style={{ fontSize: 9, color: '#4A4D6A', letterSpacing: '0.15em' }}>{label}</div>
    </div>
  )
}

/* ── Shared ── */
function ErrorBox({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 16px', marginBottom: 20,
      background: 'linear-gradient(135deg,#1E0C0C,#180808)',
      border: '1px solid rgba(239,68,68,0.25)',
      color: '#F87171', fontSize: 13,
    }}>⊗ {children}</div>
  )
}

function RightPanel({ children }) {
  return (
    <aside style={{
      width: 260, flexShrink: 0, overflowY: 'auto', padding: '40px 24px',
      background: 'linear-gradient(180deg, #12141F 0%, #0F111C 100%)',
      borderLeft: '1px solid rgba(255,255,255,0.05)',
    }}>{children}</aside>
  )
}
function PanelSection({ title }) {
  return (
    <>
      <div className="t-label" style={{ fontSize: 14, color: '#C9A227', opacity: 0.9, letterSpacing: '0.15em', marginBottom: 10 }}>{title}</div>
      <div style={{ borderBottom: '1px solid rgba(201,162,39,0.2)', marginBottom: 12 }} />
    </>
  )
}
function PanelRow({ k, v }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0' }}>
        <span style={{ fontFamily: 'Barlow Condensed', fontSize: 10, color: '#4A4D6A', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k}</span>
        <span style={{ fontFamily: 'Barlow Condensed', fontSize: 11, color: '#A0A3B8', maxWidth: 120, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
      </div>
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} />
    </>
  )
}
