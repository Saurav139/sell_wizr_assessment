const typeColors = {
  TEXT:   'bg-purple-100 text-purple-700',
  BIGINT: 'bg-blue-100 text-blue-700',
  DOUBLE: 'bg-amber-100 text-amber-700',
}

export function SchemaEditor({ schema, onChange }) {
  const update = (i, patch) => onChange(schema.map((c, j) => j === i ? { ...c, ...patch } : c))

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider w-8">#</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Column Name</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider w-36">Type</th>
          </tr>
        </thead>
        <tbody>
          {schema.map((col, i) => (
            <tr key={i} className="border-t border-gray-100 hover:bg-blue-50/40 group transition-colors">
              <td className="px-4 py-2.5 text-xs text-gray-300 font-mono">{i + 1}</td>
              <td className="px-4 py-2.5">
                <input
                  className="w-full bg-transparent font-mono text-sm text-gray-800 focus:outline-none border-b border-transparent focus:border-blue-400 py-0.5 placeholder-gray-300 transition-colors"
                  value={col.name}
                  onChange={e => update(i, { name: e.target.value })}
                />
              </td>
              <td className="px-4 py-2.5">
                <select
                  className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer ${typeColors[col.type] || 'bg-gray-100 text-gray-600'}`}
                  value={col.type}
                  onChange={e => update(i, { type: e.target.value })}
                >
                  <option>TEXT</option>
                  <option>BIGINT</option>
                  <option>DOUBLE</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
