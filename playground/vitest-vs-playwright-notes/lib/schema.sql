CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"password_hash" text NOT NULL
);
CREATE TABLE IF NOT EXISTS "sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL
);
