import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, CircleX, ClipboardPaste, Zap } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { useTestUnsavedConnection } from "@/hooks/use-connections";
import { errorText } from "@/lib/api";
import { parseConnectionString } from "@/lib/connection-string";
import type { Connection, ConnectionInput, ConnectionTestResult } from "@/types/api";

const schema = z.object({
  name: z.string().trim().min(1, "Give the connection a name").max(80),
  host: z
    .string()
    .trim()
    .min(1, "Host is required")
    .regex(/^[a-zA-Z0-9.\-_:[\]]+$/, "Use a hostname or IP address only (no protocol or path)"),
  port: z.coerce.number<number>().int().min(1, "Port must be 1–65535").max(65535, "Port must be 1–65535"),
  database: z.string().trim().min(1, "Database is required"),
  username: z.string().trim().min(1, "Username is required"),
  password: z.string(),
  sslMode: z.enum(["disable", "require", "verify-full"]),
});

type FormValues = z.infer<typeof schema>;

export function ConnectionForm({
  connection,
  submitting,
  onSubmit,
  onCancel,
}: {
  connection?: Connection;
  submitting: boolean;
  onSubmit: (values: ConnectionInput) => void;
  onCancel: () => void;
}) {
  const editing = Boolean(connection);
  const form = useForm<FormValues>({
    resolver: zodResolver(
      editing ? schema : schema.extend({ password: z.string().min(1, "Password is required") }),
    ),
    defaultValues: {
      name: connection?.name ?? "",
      host: connection?.host ?? "",
      port: connection?.port ?? 5432,
      database: connection?.database ?? "postgres",
      username: connection?.username ?? "postgres",
      password: "",
      sslMode: connection?.sslMode ?? "require",
    },
  });
  const { register, handleSubmit, formState, setValue, getValues, trigger } = form;
  const errors = formState.errors;
  const test = useTestUnsavedConnection();
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [connectionString, setConnectionString] = useState("");

  const applyConnectionString = () => {
    const parsed = parseConnectionString(connectionString);
    if (!parsed) return;
    for (const [key, value] of Object.entries(parsed)) setValue(key as keyof FormValues, value as never, { shouldValidate: true });
    if (!getValues("name")) setValue("name", parsed.host.split(".")[0] ?? "PostgreSQL");
    setConnectionString("");
  };

  const runTest = async () => {
    const valid = await trigger(["host", "port", "database", "username", ...(editing ? [] : (["password"] as const))]);
    if (!valid) return;
    const { name: _name, ...values } = getValues();
    setTestResult(null);
    test.mutate({ ...values, connectionId: connection?.id }, { onSuccess: setTestResult });
  };

  const fieldProps = (name: keyof FormValues) => ({
    id: `conn-${name}`,
    "aria-invalid": Boolean(errors[name]) || undefined,
    "aria-describedby": errors[name] ? `conn-${name}-error` : undefined,
    ...register(name),
  });

  return (
    <form onSubmit={handleSubmit((values) => onSubmit(values))} className="space-y-4" noValidate>
      {!editing ? (
        <div className="rounded-lg border border-dashed border-border-strong p-3">
          <label htmlFor="conn-url" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
            <ClipboardPaste aria-hidden className="size-3.5" /> Paste a connection string (optional)
          </label>
          <div className="flex gap-2">
            <Input
              id="conn-url"
              placeholder="postgresql://user:password@host:5432/postgres"
              value={connectionString}
              onChange={(event) => setConnectionString(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <Button variant="outline" onClick={applyConnectionString} disabled={!parseConnectionString(connectionString)}>
              Fill
            </Button>
          </div>
        </div>
      ) : null}

      <Field label="Name" htmlFor="conn-name" error={errors.name?.message}>
        <Input placeholder="Production (Supabase)" {...fieldProps("name")} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_7rem]">
        <Field label="Host" htmlFor="conn-host" error={errors.host?.message}>
          <Input placeholder="db.xxxxx.supabase.co" autoComplete="off" spellCheck={false} {...fieldProps("host")} />
        </Field>
        <Field label="Port" htmlFor="conn-port" error={errors.port?.message}>
          <Input inputMode="numeric" {...fieldProps("port")} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Database" htmlFor="conn-database" error={errors.database?.message}>
          <Input autoComplete="off" spellCheck={false} {...fieldProps("database")} />
        </Field>
        <Field label="Username" htmlFor="conn-username" error={errors.username?.message}>
          <Input autoComplete="off" spellCheck={false} {...fieldProps("username")} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Password"
          htmlFor="conn-password"
          error={errors.password?.message}
          hint={editing ? "Leave blank to keep the saved password." : "Encrypted before it is stored."}
        >
          <Input type="password" autoComplete="new-password" {...fieldProps("password")} />
        </Field>
        <Field label="SSL" htmlFor="conn-sslMode" hint="Supabase and most hosted providers need SSL.">
          <Select {...fieldProps("sslMode")}>
            <option value="require">Require (encrypt, don't verify certificate)</option>
            <option value="verify-full">Verify full (encrypt + verify certificate)</option>
            <option value="disable">Disable (local development only)</option>
          </Select>
        </Field>
      </div>

      <div aria-live="polite">
        {test.isError ? <p className="text-sm text-danger">{errorText(test.error)}</p> : null}
        {testResult ? (
          testResult.ok ? (
            <p className="flex items-center gap-2 rounded-lg border border-success bg-success-soft px-3 py-2 text-sm text-success-ink">
              <CircleCheck aria-hidden className="size-4" /> Connected in {testResult.latencyMs} ms · PostgreSQL {testResult.serverVersion?.split(" ")[0]}
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" /> {testResult.error}
            </p>
          )
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={runTest} loading={test.isPending} loadingText="Connecting…">
          <Zap aria-hidden className="size-3.5" /> Test connection
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting} loadingText="Saving…">
            {editing ? "Save changes" : "Save connection"}
          </Button>
        </div>
      </div>
    </form>
  );
}
