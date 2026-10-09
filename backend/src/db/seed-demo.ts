/**
 * Creates a small, clearly labelled demo table in a *target* database so you can try
 * DBSynchro locally without your own data. Usage:
 *   DEMO_DATABASE_URL=postgres://postgres:postgres@localhost:5432/demo npm run db:seed-demo
 */
import pg from "pg";

const url = process.env.DEMO_DATABASE_URL;
if (!url) {
  console.error("Set DEMO_DATABASE_URL to the database where the demo table should be created.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(`
    create schema if not exists demo;
    create table if not exists demo.customers (
      id serial primary key,
      name text not null,
      email text unique,
      plan text not null default 'free',
      seats integer not null default 1,
      monthly_revenue numeric(10,2) not null default 0,
      active boolean not null default true,
      signed_up_on date not null default current_date,
      settings jsonb,
      updated_at timestamptz not null default now()
    );
    comment on table demo.customers is 'DBSynchro demo data (safe to delete)';
  `);
  const { rows } = await client.query<{ count: string }>("select count(*) from demo.customers");
  if (Number(rows[0]?.count ?? 0) === 0) {
    await client.query(`
      insert into demo.customers (name, email, plan, seats, monthly_revenue, active, signed_up_on, settings) values
        ('Ada Lovelace', 'ada@example.com', 'pro', 5, 245.00, true, '2024-01-15', '{"theme":"light"}'),
        ('Grace Hopper', 'grace@example.com', 'team', 12, 980.50, true, '2024-02-03', '{"theme":"dark"}'),
        ('Alan Turing', 'alan@example.com', 'free', 1, 0, true, '2024-03-21', null),
        ('Katherine Johnson', 'katherine@example.com', 'pro', 3, 147.00, false, '2024-04-09', null),
        ('Edsger Dijkstra', 'edsger@example.com', 'team', 8, 640.00, true, '2024-05-30', '{"beta":true}');
    `);
  }
  console.log("Demo table demo.customers is ready.");
} finally {
  await client.end();
}
