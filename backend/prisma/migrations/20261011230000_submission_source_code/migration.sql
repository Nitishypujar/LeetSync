ALTER TABLE "submissions"
ADD COLUMN "source_code" TEXT NOT NULL DEFAULT '';

ALTER TABLE "verification_challenges"
ADD CONSTRAINT "verification_challenges_token_hash_key" UNIQUE ("token_hash");

ALTER TABLE "extension_pairing_codes"
ADD CONSTRAINT "extension_pairing_codes_code_hash_key" UNIQUE ("code_hash");

CREATE INDEX "verification_challenges_expires_at_idx"
ON "verification_challenges"("expires_at");

CREATE INDEX "extension_pairing_codes_expires_at_idx"
ON "extension_pairing_codes"("expires_at");
