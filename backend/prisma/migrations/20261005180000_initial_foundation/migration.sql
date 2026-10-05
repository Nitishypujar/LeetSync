CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'ATTENTION_REQUIRED', 'REVOKED');
CREATE TYPE "Difficulty" AS ENUM ('Easy', 'Medium', 'Hard');
CREATE TYPE "SubmissionStatus" AS ENUM ('ACCEPTED', 'WRONG_ANSWER', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'COMPILE_ERROR', 'OTHER');
CREATE TYPE "SyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SYNCED', 'FAILED', 'SKIPPED');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "github_user_id" BIGINT NOT NULL, "github_login" VARCHAR(255) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "users_github_user_id_key" ON "users"("github_user_id");

CREATE TABLE "github_tokens" (
  "user_id" UUID NOT NULL, "access_token_enc" TEXT NOT NULL, "refresh_token_enc" TEXT, "expires_at" TIMESTAMP(3), "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "github_tokens_pkey" PRIMARY KEY ("user_id"));
CREATE TABLE "leetcode_connections" (
  "user_id" UUID NOT NULL, "leetcode_identity" VARCHAR(255) NOT NULL, "leetcode_username" VARCHAR(255) NOT NULL, "verified_at" TIMESTAMP(3) NOT NULL, "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "leetcode_connections_pkey" PRIMARY KEY ("user_id"));
CREATE UNIQUE INDEX "leetcode_connections_leetcode_identity_key" ON "leetcode_connections"("leetcode_identity");
CREATE TABLE "verification_challenges" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL, "token_hash" VARCHAR(128) NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL, "used_at" TIMESTAMP(3),
  CONSTRAINT "verification_challenges_pkey" PRIMARY KEY ("id"));
CREATE INDEX "verification_challenges_user_id_idx" ON "verification_challenges"("user_id");
CREATE TABLE "extension_pairing_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL, "code_hash" VARCHAR(128) NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL, "used_at" TIMESTAMP(3),
  CONSTRAINT "extension_pairing_codes_pkey" PRIMARY KEY ("id"));
CREATE INDEX "extension_pairing_codes_user_id_idx" ON "extension_pairing_codes"("user_id");
CREATE TABLE "extension_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL, "token_hash" VARCHAR(128) NOT NULL, "last_seen_at" TIMESTAMP(3), "extension_version" VARCHAR(64), "revoked_at" TIMESTAMP(3),
  CONSTRAINT "extension_tokens_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "extension_tokens_token_hash_key" ON "extension_tokens"("token_hash");
CREATE INDEX "extension_tokens_user_id_idx" ON "extension_tokens"("user_id");
CREATE TABLE "repositories" (
  "user_id" UUID NOT NULL, "github_repo_id" BIGINT NOT NULL, "owner" VARCHAR(255) NOT NULL, "name" VARCHAR(255) NOT NULL, "branch" VARCHAR(255) NOT NULL,
  CONSTRAINT "repositories_pkey" PRIMARY KEY ("user_id"));
CREATE UNIQUE INDEX "repositories_github_repo_id_key" ON "repositories"("github_repo_id");
CREATE TABLE "problems" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "leetcode_number" INTEGER NOT NULL, "slug" VARCHAR(255) NOT NULL, "title" VARCHAR(500) NOT NULL, "difficulty" "Difficulty" NOT NULL,
  CONSTRAINT "problems_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "problems_leetcode_number_key" ON "problems"("leetcode_number");
CREATE TABLE "submissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL, "problem_id" UUID NOT NULL, "provider_submission_id" VARCHAR(255) NOT NULL, "language" VARCHAR(100) NOT NULL, "status" "SubmissionStatus" NOT NULL, "solution_hash" VARCHAR(128) NOT NULL, "submitted_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "submissions_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "submissions_user_id_provider_submission_id_key" ON "submissions"("user_id", "provider_submission_id");
CREATE INDEX "submissions_user_id_submitted_at_idx" ON "submissions"("user_id", "submitted_at");
CREATE TABLE "sync_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "submission_id" UUID NOT NULL, "status" "SyncJobStatus" NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0, "next_run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "last_error" TEXT, "path" VARCHAR(1000), "commit_sha" VARCHAR(100), "started_at" TIMESTAMP(3), "completed_at" TIMESTAMP(3),
  CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "sync_jobs_submission_id_key" ON "sync_jobs"("submission_id");
CREATE INDEX "sync_jobs_status_next_run_at_idx" ON "sync_jobs"("status", "next_run_at");
CREATE TABLE "sync_job_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "sync_job_id" UUID NOT NULL, "step" VARCHAR(100) NOT NULL, "outcome" VARCHAR(100) NOT NULL, "detail" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_job_events_pkey" PRIMARY KEY ("id"));
CREATE INDEX "sync_job_events_sync_job_id_created_at_idx" ON "sync_job_events"("sync_job_id", "created_at");

ALTER TABLE "github_tokens" ADD CONSTRAINT "github_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leetcode_connections" ADD CONSTRAINT "leetcode_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "verification_challenges" ADD CONSTRAINT "verification_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extension_pairing_codes" ADD CONSTRAINT "extension_pairing_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extension_tokens" ADD CONSTRAINT "extension_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sync_job_events" ADD CONSTRAINT "sync_job_events_sync_job_id_fkey" FOREIGN KEY ("sync_job_id") REFERENCES "sync_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
