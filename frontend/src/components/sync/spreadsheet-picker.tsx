import { ExternalLink, FileSpreadsheet, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { useSpreadsheets } from "@/hooks/use-google";
import { cn } from "@/lib/cn";
import { RelativeTime } from "@/components/ui/relative-time";

export function SpreadsheetPicker({ selectedId, onSelect }: { selectedId: string | null; onSelect: (spreadsheet: { id: string; name: string }) => void }) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 350);
  const query = useSpreadsheets(search, true);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
          <Input
            type="search"
            aria-label="Search your spreadsheets"
            placeholder="Search your Google spreadsheets…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="pl-8"
          />
        </div>
        <Button variant="outline" onClick={() => void query.refetch()} loading={query.isFetching && !query.isLoading} aria-label="Refresh spreadsheet list">
          <RefreshCw aria-hidden className="size-3.5" />
        </Button>
      </div>

      {query.isLoading ? (
        <SkeletonRows rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not list your spreadsheets" />
      ) : query.data?.spreadsheets.length ? (
        <ul className="scrollbar-thin max-h-80 space-y-1 overflow-y-auto">
          {query.data.spreadsheets.map((spreadsheet) => (
            <li key={spreadsheet.id}>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                  selectedId === spreadsheet.id ? "border-secondary bg-secondary-soft" : "border-border hover:bg-surface-muted",
                )}
              >
                <button type="button" onClick={() => onSelect(spreadsheet)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <FileSpreadsheet aria-hidden className="size-4 shrink-0 text-success-strong" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{spreadsheet.name}</span>
                    <span className="block truncate text-xs text-muted">
                      Edited <RelativeTime value={spreadsheet.modifiedTime} />
                      {spreadsheet.owner ? ` · ${spreadsheet.owner}` : ""}
                    </span>
                  </span>
                </button>
                <a
                  href={spreadsheet.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded p-1 text-subtle hover:text-text"
                  aria-label={`Open ${spreadsheet.name} in Google Sheets`}
                >
                  <ExternalLink aria-hidden className="size-3.5" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<FileSpreadsheet className="size-5" />}
          title={search ? "No spreadsheets match" : "No spreadsheets found"}
          description={search ? "Try a different search term." : "Create a spreadsheet in Google Sheets, then refresh this list."}
        />
      )}
    </div>
  );
}
