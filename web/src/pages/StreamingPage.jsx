import { useEffect, useState } from 'react'
import { api } from '../api'
import { LogStream } from '../components/LogStream'

export function StreamingPage({ sourceUrl, tableIndex, schema, tableName, onStarted }) {
  const [status, setStatus]           = useState('idle')
  const [streamActive, setStreamActive] = useState(false)
  const [published, setPublished]     = useState(0)
  const [errors, setErrors]           = useState(0)
  const [error, setError]             = useState('')
  const [cfg, setCfg]                 = useState(null)
  const [batchSize, setBatchSize]     = useState(50)
  const [selectedTopic, setSelectedTopic] = useState('')

  useEffect(() => {
    api.config().then(c => {
      setCfg(c)
      setSelectedTopic(c.kafka_topics?.[0] ?? '')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (status !== 'running') return
    const t = setInterval(async () => {
      try {
        const d = await api.producerStatus()
        setStatus(d.status)
        if (d.rows_published !== undefined) setPublished(d.rows_published)
        if (d.errors !== undefined) setErrors(d.errors)
        if (d.status !== 'running') { setStreamActive(false); clearInterval(t) }
      } catch {}
    }, 2000)
    return () => clearInterval(t)
  }, [status])

  const start = async () => {
    setError(''); setPublished(0); setErrors(0)
    try {
      await api.startProducer({
        url: sourceUrl, table_index: tableIndex, table_name: tableName, schema,
        kafka_brokers: cfg?.kafka_brokers,
        kafka_topic: selectedTopic,
        max_retries: 3,
        batch_size: batchSize,
      })
      setStatus('running'); setStreamActive(true)
      onStarted?.(selectedTopic)
    } catch (e) { setError(e.message) }
  }

  const stop = async () => {
    try { await api.stopProducer(); setStatus('idle'); setStreamActive(false) }
    catch (e) { setError(e.message) }
  }

  const isDone = status === 'done'
  const isRunning = status === 'running'

  return (
    <div style={{ display: 'flex', height: '100%' }}>

      {/* ── Main ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '40px 48px', borderLeft: '1px solid rgba(201,162,39,0.25)', borderRight: '1px solid rgba(201,162,39,0.25)' }}>
        <div style={{ marginBottom: 12 }}>
          <span className="t-label" style={{ fontSize: 13, color: '#C9A227', letterSpacing: '0.2em' }}>STEP 03  PRODUCE</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <h1 className="t-heading" style={{ fontSize: 48, color: '#FFFFFF', lineHeight: 1.05 }}>Streaming to Kafka</h1>
          <StatusBadge status={status} />
        </div>

        <p style={{ fontSize: 13, color: '#4A4D6A', marginBottom: 32, fontFamily: 'Barlow Condensed', letterSpacing: '0.04em' }}>
          TOPIC <span style={{ color: '#C9A227' }}>{selectedTopic || '…'}</span>
          {'  ·  '}
          TABLE <span style={{ color: '#C9A227' }}>{tableName}</span>
        </p>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 32 }}>
          {status === 'idle' && (
            <button className="btn-primary" onClick={start} style={{ padding: '11px 24px', fontSize: 12 }}>▶ Start Streaming</button>
          )}
          {isRunning && (
            <button className="btn-danger" onClick={stop} style={{ padding: '11px 20px', fontSize: 12 }}>■ Stop</button>
          )}
        </div>
        <div style={{ marginBottom: 32 }} />

        {error && <ErrorBox>{error}</ErrorBox>}

        {/* Gauge readouts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, marginBottom: 32, border: '1px solid rgba(255,255,255,0.06)' }}>
          <Gauge n={published} label="ROWS PUBLISHED" glow={isRunning} />
          <Gauge n={schema.length}    label="COLUMNS" divider />
          <Gauge n={errors}           label="ERRORS" divider glow={errors > 0} />
        </div>

        {/* Industrial progress meter */}
        {(isRunning || isDone) && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="t-label" style={{ fontSize: 9, color: '#4A4D6A' }}>PROGRESS</span>
              <span className="t-label" style={{ fontSize: 9, color: isDone ? '#C9A227' : '#7B7E9A' }}>{isDone ? '100%' : 'STREAMING…'}</span>
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
        <LogStream endpoint="/api/producer/stream" active={streamActive} />
      </div>

      {/* ── Right panel ── */}
      <RightPanel>
        <PanelSection title="Kafka Config" />
        <PanelRow k="BROKER"  v={cfg?.kafka_brokers?.join(', ') ?? ':9092'} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <span style={{ fontFamily: 'Barlow Condensed', fontSize: 10, color: '#4A4D6A', letterSpacing: '0.1em', textTransform: 'uppercase' }}>TOPIC</span>
          <select
            value={selectedTopic}
            onChange={e => setSelectedTopic(e.target.value)}
            disabled={isRunning}
            style={{
              background: '#0A0C1A', border: '1px solid rgba(201,162,39,0.2)',
              color: '#C9A227', fontFamily: 'Barlow Condensed', fontSize: 11,
              padding: '2px 6px', outline: 'none', cursor: isRunning ? 'not-allowed' : 'pointer',
              opacity: isRunning ? 0.4 : 1, maxWidth: 140,
            }}
          >
            {(cfg?.kafka_topics ?? [selectedTopic]).filter(Boolean).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <PanelRow k="TABLE"   v={tableName} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <span style={{ fontFamily: 'Barlow Condensed', fontSize: 10, color: '#4A4D6A', letterSpacing: '0.1em', textTransform: 'uppercase' }}>POLICY</span>
          <span style={{
            fontFamily: 'Barlow Condensed', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            color: '#C9A227', border: '1px solid rgba(201,162,39,0.3)',
            padding: '2px 7px', background: 'rgba(201,162,39,0.07)',
          }}>COMPACT</span>
        </div>
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


        <div style={{ marginTop: 24 }}>
          <PanelSection title="Schema" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
            {schema.map((c, i) => {
              const clr = { BIGINT: '#5B9CF6', DOUBLE: '#C9A227', TEXT: '#A0A3B8', DATE: '#F5B840' }[c.type] || '#A0A3B8'
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'Barlow', fontSize: 11, color: '#7B7E9A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{c.name}</span>
                  <span style={{ fontFamily: 'Barlow Condensed', fontSize: 9, fontWeight: 700, color: clr, border: `1px solid ${clr}30`, padding: '1px 6px', flexShrink: 0 }}>{c.type}</span>
                </div>
              )
            })}
          </div>
        </div>
      </RightPanel>
    </div>
  )
}

/* ── Status badge with lens flare ── */
function StatusBadge({ status }) {
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
      {/* Lens flare */}
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
      {/* Lens flare when glowing */}
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
      width: 280, flexShrink: 0, overflowY: 'auto', padding: '40px 24px',
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
        <span style={{ fontFamily: 'Barlow Condensed', fontSize: 11, color: '#A0A3B8', maxWidth: 130, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
      </div>
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} />
    </>
  )
}
