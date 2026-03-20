import { useEffect, useRef, useState } from 'react'

export function LogStream({ endpoint, active }) {
  const [lines, setLines] = useState([])
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!active) return
    setLines([])
    const es = new EventSource(endpoint)

    es.onmessage = (e) => {
      try {
        const p = JSON.parse(e.data)
        if (p.msg === 'stream ended') { es.close(); return }
        setLines(prev => [...prev, { level: p.level, msg: p.msg.trim(), ts: p.ts }])
      } catch {
        setLines(prev => [...prev, { level: 'info', msg: e.data, ts: '' }])
      }
    }
    es.onerror = () => es.close()
    return () => es.close()
  }, [endpoint, active])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const icon  = (l) => l === 'error' ? '✗' : l === 'progress' ? '✓' : '→'
  const color = (l) => l === 'error' ? '#F87171' : l === 'progress' ? '#C9A227' : '#7B7E9A'

  return (
    <div style={{
      height: 120, overflowY: 'auto',
      background: '#080916',
      border: '1px solid rgba(255,255,255,0.05)',
      boxShadow: 'inset 2px 2px 8px rgba(0,0,0,0.6)',
      padding: '10px 14px',
      fontFamily: 'Barlow Condensed',
      fontSize: 11,
      lineHeight: '20px',
      letterSpacing: '0.02em',
    }}>
      {lines.length === 0 && (
        <span style={{ color: '#2E3160' }}>Waiting for output…</span>
      )}
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 12 }}>
          <span style={{ color: '#2E3160', flexShrink: 0 }}>{l.ts ? l.ts.slice(11, 19) : '--------'}</span>
          <span style={{ color: color(l.level), flexShrink: 0 }}>{icon(l.level)}</span>
          <span style={{ color: '#7B7E9A' }}>{l.msg}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
