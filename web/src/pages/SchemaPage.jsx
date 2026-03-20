import { useState } from 'react'
import { RotatingPreview } from '../components/RotatingPreview'

const TYPE_META = {
  BIGINT: { color: '#5B9CF6', bg: 'rgba(91,156,246,0.1)',  border: 'rgba(91,156,246,0.25)' },
  DOUBLE: { color: '#C9A227', bg: 'rgba(201,162,39,0.1)',  border: 'rgba(201,162,39,0.25)'  },
  TEXT:   { color: '#A0A3B8', bg: 'rgba(160,163,184,0.1)', border: 'rgba(160,163,184,0.2)'  },
  DATE:   { color: '#F5B840', bg: 'rgba(245,184,64,0.1)',  border: 'rgba(245,184,64,0.25)'  },
}

function suggestTableName(url) {
  try {
    const path = new URL(url).pathname
    const last = path.split('/').filter(Boolean).pop() || 'my_table'
    return decodeURIComponent(last)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'my_table'
  } catch {
    return 'my_table'
  }
}

export function SchemaPage({ validated, onAccept }) {
  const suggested                 = suggestTableName(validated.url)
  const [schema, setSchema]       = useState(validated.schema)
  const [tableName, setTableName] = useState(suggested)

  const update = (i, patch) => setSchema(s => s.map((c, j) => j === i ? { ...c, ...patch } : c))

  const ddl = [
    `CREATE TABLE \`${tableName || '…'}\` (`,
    ...schema.slice(0, 6).map(c => `  ${c.name} ${c.type}${c.nullable ? '' : ' NOT NULL'},`),
    schema.length > 6 ? `  … (+${schema.length - 6} more)` : null,
    `  _hash CHAR(64) UNIQUE`,
    ');',
  ].filter(Boolean).join('\n')

  return (
    <div style={{ display: 'flex', height: '100%' }}>

      {/* ── Main ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '40px 48px', borderLeft: '1px solid rgba(201,162,39,0.25)', borderRight: '1px solid rgba(201,162,39,0.25)' }}>
        <div style={{ marginBottom: 12 }}>
          <span className="t-label" style={{ fontSize: 13, color: '#C9A227', letterSpacing: '0.2em' }}>STEP 02 SCHEMA</span>
        </div>

        <h1 className="t-heading" style={{ fontSize: 48, color: '#FFFFFF', marginBottom: 4, lineHeight: 1.05 }}>Edit schema</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
          <span style={{ fontFamily: 'Barlow Condensed', fontSize: 12, color: '#4A4D6A', letterSpacing: '0.08em' }}>TABLE</span>
          <span style={{ fontFamily: 'Barlow Condensed', fontSize: 14, color: '#C9A227', letterSpacing: '0.04em' }}>{suggested}</span>
        </div>

        {/* Schema table */}
        <div style={{
          background: 'linear-gradient(160deg, #1C1E32 0%, #181A2E 100%)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.4)',
          marginBottom: 32,
        }}>
          {/* Header row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '28px 1fr 120px 56px 30px',
            padding: '8px 16px',
            background: 'linear-gradient(180deg, #22244A 0%, #1E2042 100%)',
            borderBottom: '1px solid rgba(201,162,39,0.1)',
          }}>
            {['', 'COLUMN', 'TYPE', 'NULL', ''].map((h, i) => (
              <span key={i} className="t-label" style={{ fontSize: 9, color: '#C9A227', opacity: 0.6 }}>{h}</span>
            ))}
          </div>

          {schema.map((col, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '28px 1fr 120px 56px 30px',
              alignItems: 'center', padding: '0 16px',
              height: 44,
              background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
            }}>
              <span style={{ fontFamily: 'Barlow Condensed', fontSize: 12, color: '#2E3160' }}>⋮⋮</span>

              {/* Editable name */}
              <input
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  fontFamily: 'Barlow', fontSize: 13, color: '#D0D2E0', fontWeight: 500,
                  borderBottom: '1px dashed transparent', paddingBottom: 1, paddingRight: 12,
                  transition: 'border-color 0.15s',
                }}
                value={col.name}
                onChange={e => update(i, { name: e.target.value })}
                onFocus={e => e.target.style.borderBottomColor = 'rgba(201,162,39,0.4)'}
                onBlur={e => e.target.style.borderBottomColor = 'transparent'}
              />

              {/* Type selector */}
              <div>
                <select
                  style={{
                    fontFamily: 'Barlow Condensed', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                    padding: '3px 8px',
                    background: TYPE_META[col.type]?.bg || TYPE_META.TEXT.bg,
                    color: TYPE_META[col.type]?.color || TYPE_META.TEXT.color,
                    border: `1px solid ${TYPE_META[col.type]?.border || TYPE_META.TEXT.border}`,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                    outline: 'none', cursor: 'pointer',
                  }}
                  value={col.type}
                  onChange={e => update(i, { type: e.target.value })}
                >
                  <option>BIGINT</option>
                  <option>DOUBLE</option>
                  <option>TEXT</option>
                  <option>DATE</option>
                </select>
              </div>

              {/* Skeuomorphic nullable switch */}
              <NullSwitch checked={!!col.nullable} onChange={v => update(i, { nullable: v })} />

              {/* Delete */}
              <button
                onClick={() => setSchema(s => s.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#2E3160', padding: 0, transition: 'color 0.15s' }}
                onMouseOver={e => e.target.style.color = '#EF4444'}
                onMouseOut={e => e.target.style.color = '#2E3160'}
              >×</button>
            </div>
          ))}
        </div>

        {/* Table name + CTA */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 28 }}>
          <div className="t-label" style={{ fontSize: 10, color: '#C9A227', letterSpacing: '0.18em', marginBottom: 8 }}>TARGET TABLE NAME</div>
          <div style={{ display: 'flex', gap: 0 }}>
            <input
              className="input-inset"
              style={{ width: 260, padding: '11px 16px', fontSize: 13, borderRight: 'none' }}
              value={tableName}
              onChange={e => setTableName(e.target.value)}
            />
            <button
              className="btn-primary"
              onClick={() => tableName.trim() && onAccept({ schema, tableName })}
              disabled={!tableName.trim()}
              style={{ padding: '0 28px', fontSize: 12 }}
            >Start Producing →</button>
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <RightPanel>
        <PanelSection title="10-Row Preview" />
        <RotatingPreviewDark headers={schema.map(c => c.name)} rows={validated.preview} />

        <div style={{ marginTop: 28 }}>
          <PanelSection title="DDL Preview" />
          <div style={{
            background: '#080916',
            border: '1px solid rgba(201,162,39,0.1)',
            boxShadow: 'inset 3px 3px 10px rgba(0,0,0,0.6)',
            padding: '14px 16px',
            fontFamily: 'Barlow Condensed', fontSize: 12, lineHeight: 1.7,
          }}>
            {ddl.split('\n').map((line, i) => {
              const color = line.includes('CREATE') ? '#C9A227'
                : line.match(/BIGINT|DOUBLE|DATE|TEXT/) ? '#5B9CF6'
                : 'rgba(160,163,184,0.7)'
              return <div key={i} style={{ color }}>{line}</div>
            })}
          </div>
        </div>
      </RightPanel>
    </div>
  )
}

/* ── Skeuomorphic switch ── */
function NullSwitch({ checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative', width: 34, height: 18, borderRadius: 9, cursor: 'pointer',
        background: checked ? 'linear-gradient(180deg, #3A3010 0%, #2A2000 100%)' : 'linear-gradient(180deg, #1A1C30 0%, #141620 100%)',
        border: checked ? '1px solid rgba(201,162,39,0.35)' : '1px solid rgba(255,255,255,0.07)',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
        transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      {checked && <div style={{ position: 'absolute', inset: -1, borderRadius: 10, boxShadow: '0 0 8px rgba(201,162,39,0.4), 0 0 16px rgba(201,162,39,0.15)', pointerEvents: 'none' }} />}
      <div style={{
        position: 'absolute', top: 2, left: checked ? 16 : 2, width: 14, height: 14, borderRadius: '50%',
        background: checked ? 'linear-gradient(135deg,#E8C04A,#C9A227,#B8921E)' : 'linear-gradient(135deg,#7A8A9E,#5A6A7E,#3A4A5E)',
        boxShadow: checked ? '0 0 8px rgba(201,162,39,0.7), 0 2px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)' : '0 2px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)',
        transition: 'left 0.25s cubic-bezier(0.34,1.56,0.64,1), background 0.25s',
      }} />
    </div>
  )
}

/* ── Dark RotatingPreview wrapper ── */
function RotatingPreviewDark({ headers, rows }) {
  if (!headers || !rows || rows.length === 0) return null
  return (
    <div>
      <RotatingPreview headers={headers} rows={rows} />
    </div>
  )
}

/* ── Shared ── */
function RightPanel({ children }) {
  return (
    <aside style={{
      width: 340, flexShrink: 0, overflowY: 'auto', padding: '40px 24px',
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
