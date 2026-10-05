# LeetCode Detection Spike — Phase 0 Findings

## Verdict

**Accepted submissions are reliably detectable from the observed browser flow**, provided status classification is tied to the exact submission-specific response.

## Verified flow

`POST /problems/{slug}/submit/` → `submission_id` → poll `GET /submissions/detail/{submission_id}/v2/check/` → `PENDING` → terminal result → `submissionDetails` GraphQL for code/metadata.

The verified accepted capture was `Contains Duplicate II`, question `219`, submission `2163133617`, C++, with `finished=true`, `status_code=10`, `status_msg=Accepted`, `total_correct=71`, and `total_testcases=71`. The submit request contained the full code and returned the submission ID; `submissionDetails` returned code, language, timestamp, problem ID/slug, runtime, memory, and user.

## Adapter rule

Never infer Accepted from a generic status catalog containing the word `Accepted`. Bind the result to the exact submission ID and inspect the submission-specific check response.

## Remaining hardening

Full failure/language/problem/refresh matrix testing remains appropriate during later adapter hardening. The Phase 0 exit criterion is satisfied for proceeding to the foundation.
