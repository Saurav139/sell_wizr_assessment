const cfg = {
  idle:    { bg: 'bg-gray-100',        text: 'text-gray-500',  dot: 'bg-gray-400',              label: 'idle'    },
  running: { bg: 'bg-blue-50',         text: 'text-blue-700',  dot: 'bg-blue-500 animate-pulse', label: 'running' },
  done:    { bg: 'bg-green-50',        text: 'text-green-700', dot: 'bg-green-500',              label: 'done'    },
  error:   { bg: 'bg-red-50',          text: 'text-red-700',   dot: 'bg-red-500',               label: 'error'   },
}

export function StatusBadge({ status }) {
  const c = cfg[status] || cfg.idle
  return (
    <span className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider ${c.bg} ${c.text}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}
