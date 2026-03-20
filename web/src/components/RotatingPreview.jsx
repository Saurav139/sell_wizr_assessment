import { useEffect, useState } from 'react'

export function RotatingPreview({ headers, rows }) {
  const [idx, setIdx]   = useState(0)
  const [fade, setFade] = useState(true)

  useEffect(() => {
    if (!rows || rows.length === 0) return
    const t = setInterval(() => {
      setFade(false)
      setTimeout(() => { setIdx(i => (i + 1) % rows.length); setFade(true) }, 180)
    }, 2500)
    return () => clearInterval(t)
  }, [rows?.length])

  if (!headers || !rows || rows.length === 0) return null

  const row = rows[idx]
  const pct = ((idx + 1) / rows.length) * 100

  return (
    <div style={{
      background: 'linear-gradient(160deg, #1C1E32 0%, #181A2E 100%)',
      border: '1px solid rgba(255,255,255,0.06)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
    }}>
      {/* Progress line */}
      <div style={{ height: 2, background: '#0A0C1A' }}>
        <div style={{
          height: '100%',
          background: 'linear-gradient(90deg, #B8921E, #C9A227)',
          boxShadow: '0 0 6px rgba(201,162,39,0.5)',
          width: `${pct}%`,
          transition: 'width 0.7s ease',
        }} />
      </div>

      {/* Counter row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '7px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <span style={{ fontFamily: 'Barlow Condensed', fontSize: 9, color: '#4A4D6A', letterSpacing: '0.15em', textTransform: 'uppercase' }}>record</span>
        <span style={{
          fontFamily: 'Barlow Condensed', fontSize: 9, color: '#7B7E9A',
          background: 'rgba(255,255,255,0.04)', padding: '1px 7px',
          letterSpacing: '0.05em',
        }}>
          {idx + 1} / {rows.length}
        </span>
      </div>

      {/* Fields */}
      <div style={{
        padding: '12px 14px',
        opacity: fade ? 1 : 0,
        transition: 'opacity 0.18s ease',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {headers.slice(0, 10).map((h, i) => (
          <div key={h} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{
              fontFamily: 'Barlow Condensed', fontSize: 11, color: '#4A4D6A',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              flexShrink: 0, paddingTop: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              width: 90,
            }}>{h}</span>
            <span style={{ fontFamily: 'Barlow', fontSize: 13, color: '#A0A3B8', lineHeight: 1.4, wordBreak: 'break-all' }}>
              {row?.[i] !== undefined && row[i] !== ''
                ? row[i]
                : <span style={{ color: '#2E3160' }}>—</span>}
            </span>
          </div>
        ))}
        {headers.length > 10 && (
          <p style={{ fontFamily: 'Barlow Condensed', fontSize: 9, color: '#2E3160', letterSpacing: '0.08em' }}>
            +{headers.length - 6} more columns
          </p>
        )}
      </div>
    </div>
  )
}
