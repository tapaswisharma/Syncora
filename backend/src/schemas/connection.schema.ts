import { z } from "zod";

const hostPattern = /^[a-zA-Z0-9.\-_:[\]]+$/;

export const connectionFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name must be 80 characters or fewer"),
  host: z
    .string()
    .trim()
    .min(1, "Host is required")
    .max(255)
    .regex(hostPattern, "Host may only contain letters, numbers, dots, dashes, underscores and colons"),
  port: z.coerce.number().int().min(1, "Port must be between 1 and 65535").max(65535, "Port must be between 1 and 65535"),
  database: z.string().trim().min(1, "Database is required").max(63),
  username: z.string().trim().min(1, "Username is required").max(128),
  password: z.string().max(1024),
  sslMode: z.enum(["disable", "require", "verify-full"]),
});

export const createConnectionSchema = connectionFieldsSchema.extend({
  password: z.string().min(1, "Password is required").max(1024),
});

/** On update the password is optional: omitted or empty keeps the stored one. */
export const updateConnectionSchema = connectionFieldsSchema.partial();

/** Test an unsaved configuration. When `connectionId` is given, a blank password falls back to the stored one. */
export const testConnectionSchema = connectionFieldsSchema.omit({ name: true }).extend({
  connectionId: z.uuid().optional(),
});

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;
export type TestConnectionInput = z.infer<typeof testConnectionSchema>;
