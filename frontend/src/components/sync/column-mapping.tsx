import { ArrowRight, Plus, Trash2, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { defaultHeader } from "@/lib/mapping";
import type { ColumnInfo, ColumnMapping } from "@/types/api";

/** Pairs PostgreSQL columns with Google Sheets header names. */
export function ColumnMappingEditor({
  columns,
  sheetHeaders,
  mappings,
  keyColumn,
  onChange,
  onAutoMap,
}: {
  columns: ColumnInfo[];
  sheetHeaders: string[];
  mappings: ColumnMapping[];
  keyColumn: string | null;
  onChange: (mappings: ColumnMapping[]) => void;
  onAutoMap: () => void;
}) {
  const mapped = new Set(mappings.map((mapping) => mapping.pgColumn));
  const unmapped = columns.filter((column) => !mapped.has(column.name));

  const update = (index: number, patch: Partial<ColumnMapping>) =>
    onChange(mappings.map((mapping, i) => (i === index ? { ...mapping, ...patch } : mapping)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Each mapped PostgreSQL column is written to the sheet column of that name. Headers that don't exist yet are added to row 1.
        </p>
        <Button size="sm" variant="outline" onClick={onAutoMap}>
          <Wand2 aria-hidden className="size-3.5" /> Match by name
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-xs">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                PostgreSQL column
              </th>
              <th scope="col" className="w-8" />
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Google Sheets column
              </th>
              <th scope="col" className="w-12" />
            </tr>
          </thead>
          <tbody>
            {mappings.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted">
                  No columns mapped yet. Use “Match by name” or add a column below.
                </td>
              </tr>
            ) : null}
            {mappings.map((mapping, index) => {
              const column = columns.find((candidate) => candidate.name === mapping.pgColumn);
              const isKey = mapping.pgColumn === keyColumn;
              return (
                <tr key={`${mapping.pgColumn}-${index}`} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs">{mapping.pgColumn}</span>
                      <span className="text-[10px] text-subtle">{column?.dataType}</span>
                      {isKey ? <Badge tone="primary">row identifier</Badge> : null}
                      {column?.isGenerated ? <Badge tone="warning">generated</Badge> : null}
                      {!column ? <Badge tone="danger">missing from table</Badge> : null}
                    </div>
                  </td>
                  <td className="text-center text-subtle">
                    <ArrowRight aria-hidden className="mx-auto size-3.5" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Input
                        aria-label={`Sheet column for ${mapping.pgColumn}`}
                        value={mapping.sheetColumn}
                        onChange={(event) => update(index, { sheetColumn: event.target.value })}
                        className="h-8 text-xs"
                        list={sheetHeaders.length ? "sheet-headers" : undefined}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove mapping for ${mapping.pgColumn}`}
                      disabled={isKey}
                      title={isKey ? "The row identifier must stay mapped" : undefined}
                      className="text-danger hover:text-danger"
                      onClick={() => onChange(mappings.filter((_, i) => i !== index))}
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sheetHeaders.length ? (
        <datalist id="sheet-headers">
          {sheetHeaders.filter(Boolean).map((header) => (
            <option key={header} value={header} />
          ))}
        </datalist>
      ) : null}

      {unmapped.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Add a column:</span>
          <Select
            aria-label="Add a column to the mapping"
            value=""
            onChange={(event) => {
              const name = event.target.value;
              if (!name) return;
              onChange([...mappings, { pgColumn: name, sheetColumn: defaultHeader(name) }]);
            }}
            className="h-8 w-56 text-xs"
          >
            <option value="">Choose a PostgreSQL column…</option>
            {unmapped.map((column) => (
              <option key={column.name} value={column.name}>
                {column.name} ({column.dataType})
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange([...mappings, ...unmapped.map((column) => ({ pgColumn: column.name, sheetColumn: defaultHeader(column.name) }))])}
          >
            <Plus aria-hidden className="size-3.5" /> Add all {unmapped.length}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
