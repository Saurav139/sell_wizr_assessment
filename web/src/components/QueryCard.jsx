import { useEffect, useState } from 'react'
import { api } from '../api'

export function QueryCard({ activeTable }) {
  const [sql, setSql] = useState('SELECT * FROM hockey_teams LIMIT 20')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Auto-update query when a table is selected from the list
  useEffect(() => {
    if (activeTable) setSql(`SELECT * FROM ${activeTable} LIMIT 20`)
  }, [activeTable])

  const run = async () => {
    setLoading(true); setError(''); setResult(null)
    try { setResult(await api.query(sql)) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* SQL editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 font-mono">SQL</span>
          <span className="text-xs text-gray-300">⌘↵ to run</span>
        </div>
        <div className="relative">
          <textarea
            className="w-full font-mono text-xs bg-gray-950 text-gray-100 border border-gray-800 rounded-xl p-3.5 resize-none h-24 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
            value={sql}
            onChange={e => setSql(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run() }}
            spellCheck={false}
          />
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-gray-100 rounded-xl text-xs font-semibold transition-colors border border-gray-700"
        >
          {loading ? '⟳ Running...' : '▶ Run Query'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-red-700 text-xs font-mono">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400 font-mono">{result.rows?.length ?? 0} rows returned</span>
          </div>
          <div className="overflow-auto flex-1 border border-gray-200 rounded-xl">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {result.columns.map(c => (
                    <th key={c} className="text-left px-3 py-2 text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap font-mono">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(result.rows || []).map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    {row.map((cell, j) => (
                      <td key={j} className="px-3 py-1.5 text-gray-700 whitespace-nowrap font-mono max-w-32 truncate">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {(!result.rows || result.rows.length === 0) && (
              <p className="text-center text-gray-400 py-6 text-xs">No rows returned</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
