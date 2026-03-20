import { useEffect, useState } from 'react'
import { api } from '../api'

const SAMPLES = [
  { label: 'Countries by GDP',  url: 'https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal)', idx: 1 },
  { label: 'S&P 500 Companies', url: 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies',        idx: 0 },
  { label: 'NHL Hockey Stats',  url: 'https://www.scrapethissite.com/pages/forms/',                       idx: 0 },
  { label: 'Largest Companies', url: 'https://en.wikipedia.org/wiki/List_of_largest_companies_by_revenue',idx: 0 },
  { label: 'World Population',  url: 'https://www.worldometers.info/world-population/population-by-country/', idx: 0 },
]

export function UrlEntryPage({ onSuccess }) {
  const [url, setUrl]               = useState('')
  const [tableIndex, setTableIndex] = useState(0)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [result, setResult]         = useState(null)
  const [cfg, setCfg]               = useState(null)

  useEffect(() => { api.config().then(setCfg).catch(() => {}) }, [])

  const analyze = async (u = url, idx = tableIndex) => {
    if (!u.trim()) return
    setLoading(true); setError(''); setResult(null)
    try {
      const data = await api.validate(u.trim(), idx)
      setResult({ ...data, url: u.trim(), idx })
    } catch (e) {
      const msg = e.message || ''
      if (msg.startsWith('fetch failed'))      setError('URL is invalid, unreachable after 4 attempts.')
      else if (msg.includes('no HTML tables')) setError('No HTML table found at this URL.')
      else                                     setError(msg)
    } finally { setLoading(false) }
  }

  const proceed    = () => { if (result) onSuccess({ url: result.url, tableIndex: result.idx, ...result }) }
  const pickSample = (s) => { setUrl(s.url); setTableIndex(s.idx); setResult(null); setError('') }

  return (
    <div style={{ display: 'flex', height: '100%' }}>

      {/* ── Main ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '40px 48px', borderLeft: '1px solid rgba(201,162,39,0.25)', borderRight: '1px solid rgba(201,162,39,0.25)' }}>

        {/* Eyebrow */}
        <div style={{ marginBottom: 12 }}>
          <span className="t-label" style={{ fontSize: 13, color: '#C9A227', letterSpacing: '0.2em' }}>STEP 01  FETCH</span>
        </div>

        <h1 className="t-heading" style={{ fontSize: 48, color: '#FFFFFF', marginBottom: 12, lineHeight: 1.05 }}>
          Fetch a URL
        </h1>
        <p style={{ fontSize: 15, color: '#7B7E9A', marginBottom: 36, maxWidth: 480, lineHeight: 1.6 }}>
          Point at any page with HTML tables, we'll extract, parse rowspan &amp; colspan, and infer a schema automatically.
        </p>

        {/* URL input */}
        <div style={{ marginBottom: 6 }}>
          <span className="t-label" style={{ fontSize: 12, color: '#C9A227', letterSpacing: '0.18em' }}>SOURCE URL</span>
        </div>
        <div style={{ display: 'flex', marginBottom: 20, gap: 0 }}>
          <input
            className="input-inset"
            style={{ flex: 1, padding: '11px 16px', fontSize: 13, borderRight: 'none' }}
            placeholder="https://en.wikipedia.org/wiki/…"
            value={url}
            onChange={e => { setUrl(e.target.value); setResult(null) }}
            onKeyDown={e => e.key === 'Enter' && analyze()}
          />
          <button
            className="btn-primary"
            onClick={() => analyze()}
            disabled={loading || !url.trim()}
            style={{ padding: '0 28px', fontSize: 12 }}
          >
            {loading
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Spinner /> Fetching…</span>
              : 'Validate'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px', marginBottom: 20,
            background: 'linear-gradient(135deg, #1E0C0C 0%, #180808 100%)',
            border: '1px solid rgba(239,68,68,0.25)',
          }}>
            <span style={{ fontSize: 16, color: '#EF4444' }}>⊗</span>
            <span style={{ fontSize: 13, color: '#F87171' }}>{error}</span>
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span className="t-label" style={{ fontSize: 9, color: '#4A4D6A', letterSpacing: '0.18em' }}>
                DETECTED TABLES — {result.table_count} FOUND
              </span>
              {result.table_count > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'Barlow', fontSize: 12, color: '#7B7E9A' }}>Table</span>
                  <input type="range" min={0} max={result.table_count - 1} value={tableIndex}
                    onChange={e => { const i = Number(e.target.value); setTableIndex(i); analyze(result.url, i) }}
                    style={{ width: 100, accentColor: '#C9A227' }}
                  />
                  <span style={{ fontFamily: 'Barlow Condensed', fontSize: 12, color: '#C9A227', minWidth: 14 }}>{tableIndex + 1}</span>
                </div>
              )}
            </div>

            {/* Results table */}
            <div style={{
              background: 'linear-gradient(160deg, #1C1E32 0%, #181A2E 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.4)',
              marginBottom: 20,
            }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '32px 1fr 80px',
                padding: '8px 16px',
                background: 'linear-gradient(180deg, #22244A 0%, #1E2042 100%)',
                borderBottom: '1px solid rgba(201,162,39,0.12)',
              }}>
                {['#', 'COLUMN', 'TYPE'].map(h => (
                  <span key={h} className="t-label" style={{ fontSize: 9, color: '#C9A227', opacity: 0.7 }}>{h}</span>
                ))}
              </div>

              {result.schema.map((col, i) => (
                <div key={col.name} style={{
                  display: 'grid', gridTemplateColumns: '32px 1fr 80px',
                  padding: '9px 16px',
                  background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                  borderBottom: i < result.schema.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                }}>
                  <span style={{ fontFamily: 'Barlow Condensed', fontSize: 11, color: '#4A4D6A' }}>{i + 1}</span>
                  <span style={{ fontFamily: 'Barlow', fontSize: 13, color: '#D0D2E0', fontWeight: 500 }}>{col.name}</span>
                  <TypeChip type={col.type} />
                </div>
              ))}

              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 16px',
                background: 'linear-gradient(180deg, #1E2244 0%, #1C1E32 100%)',
                borderTop: '1px solid rgba(201,162,39,0.1)',
              }}>
                <span style={{ fontFamily: 'Barlow', fontSize: 11, color: '#4A4D6A' }}>{result.schema.length} cols · {result.row_count} rows</span>
                <span className="t-sublabel" style={{ fontSize: 9, color: '#C9A227', letterSpacing: '0.12em' }}>● SELECTED</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-secondary" onClick={() => { setResult(null); setUrl('') }} style={{ padding: '10px 20px', fontSize: 12 }}>
                ← Reset
              </button>
              <button className="btn-primary" onClick={proceed} style={{ padding: '10px 24px', fontSize: 12 }}>
                Edit Schema →
              </button>
            </div>
          </>
        )}

        {/* Pipeline diagram */}
        <div style={{ marginTop: 48, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <span className="t-label" style={{ fontSize: 12, color: '#C9A227', letterSpacing: '0.18em' }}>DATA PIPELINE</span>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginTop: 16 }}>
            <PipeNode icon={<HtmlIcon />}  title="HTML Page"     sub="rowspan + colspan" accent="#E34F26" />
            <PipeArrow />
            <PipeNode icon={<ParseIcon />} title="Parse & Infer" sub="schema types"      accent="#C9A227" />
            <PipeArrow />
            <PipeNode icon={<KafkaIcon />} title="Kafka Topic"   sub="streamed records"  accent="#8A9BAE" />
            <PipeArrow />
            <PipeNode icon={<MySQLIcon />} title="MySQL Table"   sub="deduped rows"      accent="#4B9EE0" />
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <aside style={{
        width: 300, flexShrink: 0, overflowY: 'auto', padding: '40px 24px',
        background: 'linear-gradient(180deg, #12141F 0%, #0F111C 100%)',
        borderLeft: '1px solid rgba(255,255,255,0.05)',
      }}>
        <PanelSection title="Quick Samples" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 28 }}>
          {SAMPLES.map(s => (
            <button key={s.url} onClick={() => pickSample(s)} style={{
              display: 'block', textAlign: 'left', padding: '10px 12px',
              background: url === s.url ? 'rgba(201,162,39,0.07)' : 'rgba(255,255,255,0.02)',
              border: url === s.url ? '1px solid rgba(201,162,39,0.25)' : '1px solid rgba(255,255,255,0.04)',
              boxShadow: url === s.url ? 'inset 2px 0 0 #C9A227' : 'inset 2px 0 0 transparent',
              cursor: 'pointer', transition: 'all 0.2s ease',
            }}>
              <div style={{ fontFamily: 'Barlow', fontWeight: 600, fontSize: 13, color: '#FFFFFF', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: 'Barlow Condensed', fontSize: 11, color: '#C9A227', wordBreak: 'break-all' }}>{s.url.replace('https://', '')}</div>
            </button>
          ))}
        </div>

        <PanelSection title="Environment" />
        <PanelRow k="KAFKA_BROKER" v={cfg?.kafka_brokers?.join(', ') ?? '…'} />
        <PanelRow k="KAFKA_TOPIC"  v={cfg?.kafka_topics?.join(', ') ?? '…'} />
        <PanelRow k="MYSQL_DSN"    v={cfg?.db_dsn ? cfg.db_dsn.replace(/^[^@]*@/, '') : '…'} />
      </aside>
    </div>
  )
}

/* ── Pipeline nodes ── */
function PipeNode({ icon, title, sub, accent }) {
  return (
    <div style={{
      flex: 1, padding: '18px 16px',
      background: 'linear-gradient(160deg, #1C1E32 0%, #181A30 100%)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderTop: `2px solid ${accent}`,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 4px 16px rgba(0,0,0,0.35)',
    }}>
      <div style={{ marginBottom: 10 }}>{icon}</div>
      <div style={{ fontFamily: 'Rajdhani', fontWeight: 600, fontSize: 14, color: '#D0D2E0', marginBottom: 3 }}>{title}</div>
      <div style={{ fontFamily: 'Barlow', fontSize: 11, color: '#4A4D6A' }}>{sub}</div>
    </div>
  )
}
function PipeArrow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px', color: 'rgba(255,255,255,0.15)', fontSize: 16, flexShrink: 0, alignSelf: 'center' }}>→</div>
  )
}

/* ── Type chip ── */
function TypeChip({ type }) {
  const MAP = {
    BIGINT: { bg: 'rgba(91,156,246,0.12)',  color: '#5B9CF6', border: 'rgba(91,156,246,0.25)'  },
    DOUBLE: { bg: 'rgba(201,162,39,0.1)',   color: '#C9A227', border: 'rgba(201,162,39,0.25)'  },
    TEXT:   { bg: 'rgba(160,163,184,0.1)',  color: '#A0A3B8', border: 'rgba(160,163,184,0.2)'  },
    DATE:   { bg: 'rgba(245,184,64,0.1)',   color: '#F5B840', border: 'rgba(245,184,64,0.25)'  },
  }
  const s = MAP[type] || MAP.TEXT
  return (
    <span style={{
      fontFamily: 'Barlow Condensed', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
      padding: '2px 7px', background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>{type}</span>
  )
}

/* ── Panel shared ── */
function PanelSection({ title }) {
  return (
    <>
      <div className="t-label" style={{ fontSize: 12, color: '#C9A227', letterSpacing: '0.18em', marginBottom: 10 }}>{title}</div>
      <div style={{ borderBottom: '1px solid rgba(201,162,39,0.15)', marginBottom: 12 }} />
    </>
  )
}
function PanelRow({ k, v }) {
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '9px 0', gap: 3 }}>
        <span style={{ fontFamily: 'Barlow Condensed', fontSize: 10, color: '#FFFFFF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k}</span>
        <span style={{ fontFamily: 'Barlow Condensed', fontSize: 12, color: '#C9A227', wordBreak: 'break-all' }}>{v}</span>
      </div>
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} />
    </>
  )
}

/* ── SVG Icons ── */
function HtmlIcon() {
  return (
    <svg width="32" height="36" viewBox="0 0 512 512" fill="none">
      <path d="M71 460L30 0h452l-41 460-185 52L71 460z" fill="#E34F26"/>
      <path d="M256 472l149-41 35-396H256v437z" fill="#EF652A"/>
      <path d="M256 208h-75l-5-58h80V92H114l14 156h128v-40zm0 92l-1 1-63-17-4-45h-56l8 87 116 32 0-58z" fill="#fff"/>
      <path d="M256 208v40h70l-7 73-63 17v58l116-32 9-99-125 1zm0-116v58h138l4-58H256z" fill="#fff"/>
    </svg>
  )
}
function ParseIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="2" y="2" width="12" height="8" rx="1" stroke="#C9A227" strokeWidth="1.5" fill="rgba(201,162,39,0.1)"/>
      <rect x="18" y="2" width="12" height="8" rx="1" stroke="#C9A227" strokeWidth="1.5" fill="rgba(201,162,39,0.1)"/>
      <rect x="10" y="22" width="12" height="8" rx="1" stroke="#C9A227" strokeWidth="1.5" fill="rgba(201,162,39,0.25)"/>
      <line x1="8" y1="10" x2="16" y2="22" stroke="#C9A227" strokeWidth="1.2"/>
      <line x1="24" y1="10" x2="16" y2="22" stroke="#C9A227" strokeWidth="1.2"/>
    </svg>
  )
}
function KafkaIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="4" fill="#8A9BAE"/>
      <circle cx="16" cy="4"  r="2.5" fill="#8A9BAE"/>
      <circle cx="16" cy="28" r="2.5" fill="#8A9BAE"/>
      <circle cx="4"  cy="16" r="2.5" fill="#8A9BAE"/>
      <circle cx="28" cy="16" r="2.5" fill="#8A9BAE"/>
      <line x1="16" y1="12" x2="16" y2="6.5"  stroke="#8A9BAE" strokeWidth="1.2"/>
      <line x1="16" y1="20" x2="16" y2="25.5" stroke="#8A9BAE" strokeWidth="1.2"/>
      <line x1="12" y1="16" x2="6.5" y2="16"  stroke="#8A9BAE" strokeWidth="1.2"/>
      <line x1="20" y1="16" x2="25.5" y2="16" stroke="#8A9BAE" strokeWidth="1.2"/>
    </svg>
  )
}
function MySQLIcon() {
  return (
    <svg width="38" height="28" viewBox="0 0 180 130" fill="none">
      <path d="M90 10 C50 10 20 35 20 65 C20 90 40 108 70 115" stroke="#4B9EE0" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
      <path d="M96 95 C100 85 108 78 118 75 C128 72 140 76 148 84 C155 91 158 102 155 112" stroke="#4B9EE0" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
      <path d="M85 25 C95 20 108 18 120 22 C132 26 142 35 148 47" stroke="#F5B840" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      <circle cx="75" cy="35" r="5" fill="#4B9EE0"/>
    </svg>
  )
}
function Spinner() {
  return (
    <svg style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none">
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2"/>
      <path fill="currentColor" opacity="0.8" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  )
}
