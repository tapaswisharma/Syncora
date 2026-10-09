import { cn } from "@/lib/cn";

/** DBSynchro mark: a database cylinder and a sheet, joined by a sync arrow. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("size-8", className)}>
      <rect width="64" height="64" rx="16" className="fill-[#17212b] dark:fill-[#e5ebf0]" />
      <ellipse cx="24" cy="22" rx="12" ry="5" fill="#B6D0E2" />
      <path d="M12 22v16c0 2.8 5.4 5 12 5s12-2.2 12-5V22" fill="none" stroke="#B6D0E2" strokeWidth="4" />
      <rect x="34" y="30" width="20" height="22" rx="4" fill="#C1D0B5" />
      <path d="M38 37h12M38 42h12M38 47h8" className="stroke-[#17212b]" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M36 14h10l-3-3M46 14l-3 3" stroke="#FADADD" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BrandName({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight text-text">DBSynchro</span>
        <span className="block text-[10.5px] text-muted">Sheets ↔ PostgreSQL</span>
      </span>
    </span>
  );
}
