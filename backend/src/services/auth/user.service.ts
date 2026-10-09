import { getDb } from "../../db/client.js";
import { users } from "../../db/schema.js";
import type { AuthenticatedUser } from "./token-verifier.js";

const recentlySynced = new Map<string, number>();
const RESYNC_INTERVAL_MS = 5 * 60 * 1000;

/** Keeps the local `users` row in step with the Supabase identity (at most every 5 minutes per user). */
export async function ensureUser(user: AuthenticatedUser): Promise<void> {
  const last = recentlySynced.get(user.id);
  if (last && Date.now() - last < RESYNC_INTERVAL_MS) return;
  const now = new Date();
  await getDb()
    .insert(users)
    .values({ id: user.id, email: user.email, displayName: user.displayName, avatarUrl: user.avatarUrl, lastSeenAt: now })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: user.email, displayName: user.displayName, avatarUrl: user.avatarUrl, lastSeenAt: now },
    });
  recentlySynced.set(user.id, Date.now());
}
