import { Table2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

/** Read-only preview of the first rows of a worksheet. */
export function SheetPreview({ headers, rows }: { headers: string[]; rows: Array<Array<string | number | boolean>> }) {
  if (!headers.some(Boolean) && rows.length === 0) {
    return (
      <EmptyState
        icon={<Table2 className="size-5" />}
        title="This worksheet is empty"
        description="DBSynchro will write the header row and your data on the first PostgreSQL → Sheets sync."
      />
    );
  }
  return (
    <div className="scrollbar-thin overflow-auto rounded-xl border border-border">
      <table className="w-full text-xs">
        <thead className="bg-secondary-soft text-secondary-ink">
          <tr>
            <th scope="col" className="w-10 px-2 py-1.5 text-left font-medium">
              #
            </th>
            {headers.map((header, index) => (
              <th key={index} scope="col" className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                {header || <span className="text-subtle italic">(empty)</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-border">
              <td className="tabular px-2 py-1.5 text-subtle">{rowIndex + 2}</td>
              {headers.map((_, columnIndex) => (
                <td key={columnIndex} className="max-w-48 truncate px-2 py-1.5 font-mono">
                  {String(row[columnIndex] ?? "")}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr className="border-t border-border">
              <td colSpan={headers.length + 1} className="px-2 py-3 text-center text-muted">
                Header row only: no data rows yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
