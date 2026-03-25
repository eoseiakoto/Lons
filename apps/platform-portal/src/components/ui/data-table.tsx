interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export function DataTable<T extends { id: string }>({ columns, data, onRowClick, emptyMessage = 'No data found' }: DataTableProps<T>) {
  if (data.length === 0) {
    return <div className="text-center py-8 text-white/40">{emptyMessage}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={`border-b border-white/5 ${onRowClick ? 'cursor-pointer hover:bg-white/5' : ''} transition-colors duration-150`}
            >
              {columns.map((col, i) => (
                <td key={i} className={`px-4 py-3 text-sm text-white ${col.className || ''}`}>
                  {typeof col.accessor === 'function' ? col.accessor(row) : String(row[col.accessor] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
