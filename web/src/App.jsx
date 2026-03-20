import { useState } from 'react'
import { UrlEntryPage }  from './pages/UrlEntryPage'
import { SchemaPage }    from './pages/SchemaPage'
import { StreamingPage } from './pages/StreamingPage'
import { ConsumerPage }  from './pages/ConsumerPage'

const STEPS = [
  { n: '01', label: 'Fetch',   short: 'F' },
  { n: '02', label: 'Schema',  short: 'S' },
  { n: '03', label: 'Produce', short: 'P' },
  { n: '04', label: 'Consume', short: 'C' },
]

export default function App() {
  const [tab, setTab]             = useState(0)
  const [validated, setValidated] = useState(null)
  const [accepted, setAccepted]   = useState(null)
  const [streamed, setStreamed]    = useState(null) // { topic, tableName }

  const handleValidated = (data) => { setValidated(data); setTab(1) }
  const handleAccepted  = (data) => { setAccepted(data);  setTab(2) }

  const unlocked = (i) => {
    if (i === 0) return true
    if (i === 1) return !!validated
    if (i === 2) return !!accepted
    if (i === 3) return !!accepted
    return false
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#151623' }}>

      {/* ── Left sidebar ── */}
      <aside style={{
        width: 200,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #181A30 0%, #13152A 100%)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '2px 0 20px rgba(0,0,0,0.4)',
      }}>

        {/* Brand */}
        <div style={{
          padding: '24px 20px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'radial-gradient(circle, #E8C04A 0%, #C9A227 40%, #8A6810 100%)',
              boxShadow: '0 0 8px 2px rgba(201,162,39,0.6), 0 0 20px 6px rgba(201,162,39,0.25), 0 0 40px 12px rgba(201,162,39,0.1)',
              flexShrink: 0,
            }} />
            <div>
              <div style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 18, color: '#FFFFFF', letterSpacing: '0.05em', lineHeight: 1 }}>table</div>
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, color: '#C9A227', letterSpacing: '0.18em' }}>PIPE</div>
            </div>
          </div>
        </div>

        {/* Step nav */}
        <nav style={{ padding: '16px 12px', flex: 1 }}>
          {STEPS.map((step, i) => {
            const active  = tab === i
            const enabled = unlocked(i)
            return (
              <button
                key={step.n}
                onClick={() => enabled && setTab(i)}
                disabled={!enabled}
                className="step-btn"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '11px 12px',
                  marginBottom: 6,
                  background: active
                    ? 'linear-gradient(135deg, #2A2840 0%, #222040 100%)'
                    : 'linear-gradient(180deg, #1E2038 0%, #181A30 100%)',
                  border: active
                    ? '1px solid rgba(201,162,39,0.3)'
                    : '1px solid rgba(255,255,255,0.05)',
                  boxShadow: active
                    ? '0 0 0 1px rgba(201,162,39,0.1), inset 0 1px 0 rgba(255,255,255,0.07), 0 4px 0 #0A0C18, 0 6px 14px rgba(0,0,0,0.45)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.04), 0 3px 0 #0A0C18, 0 5px 10px rgba(0,0,0,0.35)',
                  cursor: enabled ? 'pointer' : 'not-allowed',
                  opacity: enabled ? 1 : 0.35,
                  textAlign: 'left',
                }}>
                {/* LED */}
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: active ? '#C9A227' : '#2E3060',
                  boxShadow: active
                    ? '0 0 5px 1px rgba(201,162,39,0.9), 0 0 12px 3px rgba(201,162,39,0.45), 0 0 24px 6px rgba(201,162,39,0.2)'
                    : 'none',
                  transition: 'all 0.3s ease',
                }} />
                <div>
                  <div className="t-sublabel" style={{ fontSize: 9, color: active ? '#C9A227' : '#4A4D6A', marginBottom: 1 }}>{step.n}</div>
                  <div style={{ fontFamily: 'Rajdhani', fontWeight: 600, fontSize: 15, color: active ? '#FFFFFF' : '#7B7E9A', letterSpacing: '0.04em' }}>{step.label}</div>
                </div>
              </button>
            )
          })}
        </nav>

      </aside>

      {/* ── Page content ── */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 0 && <UrlEntryPage onSuccess={handleValidated} />}
        {tab === 1 && validated && <SchemaPage validated={validated} onAccept={handleAccepted} />}
        {tab === 2 && accepted && validated && (
          <StreamingPage
            sourceUrl={validated.url}
            tableIndex={validated.tableIndex}
            schema={accepted.schema}
            tableName={accepted.tableName}
            onStarted={(topic) => setStreamed({ topic, tableName: accepted.tableName })}
          />
        )}
        {tab === 3 && <ConsumerPage tableName={accepted?.tableName} streamedTopic={streamed?.topic} />}
      </div>
    </div>
  )
}

