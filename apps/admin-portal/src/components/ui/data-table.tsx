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

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  onRowClick,
  emptyMessage = 'No data found',
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-[color:var(--text-tertiary)] text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table-clean min-w-full">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={row.id ?? idx}
              onClick={() => onRowClick?.(row)}
              className={onRowClick ? 'cursor-pointer table-row-enter' : 'table-row-enter'}
              style={idx < 10 ? { animationDelay: `${idx * 35}ms` } : undefined}
            >
              {columns.map((col, i) => (
                <td key={i} className={col.className || ''}>
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
