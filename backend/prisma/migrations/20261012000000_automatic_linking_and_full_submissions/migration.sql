ALTER TABLE "users"
  ADD COLUMN "github_display_name" VARCHAR(255),
  ADD COLUMN "time_zone" VARCHAR(100) NOT NULL DEFAULT 'UTC';

ALTER TABLE "leetcode_connections"
  ADD COLUMN "detected_username" VARCHAR(255),
  ALTER COLUMN "verified_at" DROP NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "problems"
  ADD COLUMN "topic_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "submissions"
  ADD COLUMN "runtime" VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN "memory" VARCHAR(100) NOT NULL DEFAULT '';
