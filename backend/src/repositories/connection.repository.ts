import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { connections, type Connection } from "../db/schema.js";

export type NewConnection = typeof connections.$inferInsert;

export const connectionRepository = {
  listByUser(userId: string) {
    return getDb().select().from(connections).where(eq(connections.userId, userId)).orderBy(desc(connections.createdAt));
  },
  async findForUser(userId: string, id: string): Promise<Connection | undefined> {
    const [row] = await getDb()
      .select()
      .from(connections)
      .where(and(eq(connections.id, id), eq(connections.userId, userId)));
    return row;
  },
  async create(values: NewConnection): Promise<Connection> {
    const [row] = await getDb().insert(connections).values(values).returning();
    return row!;
  },
  async update(userId: string, id: string, values: Partial<NewConnection>): Promise<Connection | undefined> {
    const [row] = await getDb()
      .update(connections)
      .set(values)
      .where(and(eq(connections.id, id), eq(connections.userId, userId)))
      .returning();
    return row;
  },
  async delete(userId: string, id: string): Promise<boolean> {
    const rows = await getDb()
      .delete(connections)
      .where(and(eq(connections.id, id), eq(connections.userId, userId)))
      .returning({ id: connections.id });
    return rows.length > 0;
  },
};
