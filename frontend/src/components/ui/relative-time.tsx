import { useEffect, useState } from "react";
import { formatDateTime, timeAgo } from "@/lib/format";

/** Relative time that refreshes every 30 s, with the exact timestamp on hover and for screen readers. */
export function RelativeTime({ value, fallback = "Never" }: { value: string | null | undefined; fallback?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  if (!value) return <span>{fallback}</span>;
  return (
    <time dateTime={value} title={formatDateTime(value)}>
      {timeAgo(value)}
    </time>
  );
}
