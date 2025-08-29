CREATE TYPE "public"."target" AS ENUM('gemlogin', 'gemphonefarm', 'n8n');--> statement-breakpoint
CREATE TABLE "scripts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"target" "target" NOT NULL,
	"summary" text NOT NULL,
	"language" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"confidence" real,
	"last_updated" timestamp,
	"params_required" jsonb,
	"params_default" jsonb,
	"token" text,
	"device_id" text,
	"profile_id" text,
	"workflow_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
