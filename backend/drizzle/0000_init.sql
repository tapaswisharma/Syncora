CREATE TYPE "public"."activity_status" AS ENUM('SUCCESS', 'FAILURE', 'INFO');--> statement-breakpoint
CREATE TYPE "public"."conflict_side" AS ENUM('POSTGRES', 'SHEETS');--> statement-breakpoint
CREATE TYPE "public"."conflict_status" AS ENUM('OPEN', 'RESOLVED_AUTO', 'RESOLVED_MANUAL', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."conflict_strategy" AS ENUM('LAST_WRITE_WINS', 'POSTGRES_WINS', 'GOOGLE_SHEETS_WINS', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."conflict_type" AS ENUM('UPDATE_UPDATE', 'UPDATE_DELETE', 'DELETE_UPDATE', 'INSERT_INSERT');--> statement-breakpoint
CREATE TYPE "public"."delete_mode" AS ENUM('CONFIRM', 'NEVER');--> statement-breakpoint
CREATE TYPE "public"."health_status" AS ENUM('UNKNOWN', 'CONNECTED', 'DEGRADED', 'DISCONNECTED');--> statement-breakpoint
CREATE TYPE "public"."ssl_mode" AS ENUM('disable', 'require', 'verify-full');--> statement-breakpoint
CREATE TYPE "public"."sync_direction" AS ENUM('POSTGRES_TO_SHEETS', 'SHEETS_TO_POSTGRES', 'BIDIRECTIONAL');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."sync_trigger" AS ENUM('MANUAL', 'SCHEDULED');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"status" "activity_status" DEFAULT 'SUCCESS' NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"entity_name" text,
	"message" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 5432 NOT NULL,
	"database" text NOT NULL,
	"username" text NOT NULL,
	"password_encrypted" text NOT NULL,
	"ssl_mode" "ssl_mode" DEFAULT 'require' NOT NULL,
	"health_status" "health_status" DEFAULT 'UNKNOWN' NOT NULL,
	"last_latency_ms" integer,
	"last_error" text,
	"last_checked_at" timestamp with time zone,
	"server_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"google_email" text,
	"access_token_encrypted" text,
	"refresh_token_encrypted" text,
	"token_expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"health_status" "health_status" DEFAULT 'UNKNOWN' NOT NULL,
	"last_error" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"name" text NOT NULL,
	"database_name" text,
	"schema_name" text NOT NULL,
	"table_name" text NOT NULL,
	"key_column" text NOT NULL,
	"timestamp_column" text,
	"spreadsheet_id" text NOT NULL,
	"spreadsheet_name" text NOT NULL,
	"worksheet_id" integer NOT NULL,
	"worksheet_title" text NOT NULL,
	"direction" "sync_direction" NOT NULL,
	"conflict_strategy" "conflict_strategy" DEFAULT 'MANUAL' NOT NULL,
	"delete_mode" "delete_mode" DEFAULT 'CONFIRM' NOT NULL,
	"schedule_minutes" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_run_status" "sync_run_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sync_configuration_id" uuid NOT NULL,
	"sync_run_id" uuid,
	"row_key" text NOT NULL,
	"type" "conflict_type" NOT NULL,
	"strategy" "conflict_strategy" NOT NULL,
	"status" "conflict_status" DEFAULT 'OPEN' NOT NULL,
	"resolution" "conflict_side",
	"postgres_values" jsonb,
	"sheet_values" jsonb,
	"message" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_configuration_id" uuid NOT NULL,
	"pg_column" text NOT NULL,
	"sheet_column" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_row_states" (
	"sync_configuration_id" uuid NOT NULL,
	"row_key" text NOT NULL,
	"row_hash" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_row_states_sync_configuration_id_row_key_pk" PRIMARY KEY("sync_configuration_id","row_key")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_configuration_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"direction" "sync_direction" NOT NULL,
	"trigger" "sync_trigger" DEFAULT 'MANUAL' NOT NULL,
	"status" "sync_run_status" DEFAULT 'RUNNING' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"rows_processed" integer DEFAULT 0 NOT NULL,
	"rows_inserted" integer DEFAULT 0 NOT NULL,
	"rows_updated" integer DEFAULT 0 NOT NULL,
	"rows_deleted" integer DEFAULT 0 NOT NULL,
	"conflicts_count" integer DEFAULT 0 NOT NULL,
	"errors_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_integrations" ADD CONSTRAINT "google_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_configurations" ADD CONSTRAINT "sync_configurations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_configurations" ADD CONSTRAINT "sync_configurations_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_sync_configuration_id_sync_configurations_id_fk" FOREIGN KEY ("sync_configuration_id") REFERENCES "public"."sync_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mappings" ADD CONSTRAINT "sync_mappings_sync_configuration_id_sync_configurations_id_fk" FOREIGN KEY ("sync_configuration_id") REFERENCES "public"."sync_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_row_states" ADD CONSTRAINT "sync_row_states_sync_configuration_id_sync_configurations_id_fk" FOREIGN KEY ("sync_configuration_id") REFERENCES "public"."sync_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_sync_configuration_id_sync_configurations_id_fk" FOREIGN KEY ("sync_configuration_id") REFERENCES "public"."sync_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_user_created_idx" ON "activity_logs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "connections_user_idx" ON "connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_user_name_uniq" ON "connections" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "google_integrations_user_uniq" ON "google_integrations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sync_configurations_user_idx" ON "sync_configurations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sync_configurations_connection_idx" ON "sync_configurations" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "sync_conflicts_user_status_idx" ON "sync_conflicts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "sync_conflicts_config_idx" ON "sync_conflicts" USING btree ("sync_configuration_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "sync_mappings_pg_column_uniq" ON "sync_mappings" USING btree ("sync_configuration_id","pg_column");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_mappings_sheet_column_uniq" ON "sync_mappings" USING btree ("sync_configuration_id","sheet_column");--> statement-breakpoint
CREATE INDEX "sync_runs_config_started_idx" ON "sync_runs" USING btree ("sync_configuration_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sync_runs_user_started_idx" ON "sync_runs" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sync_runs_status_idx" ON "sync_runs" USING btree ("status");