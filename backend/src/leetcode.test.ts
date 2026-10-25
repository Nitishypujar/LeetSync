import { describe, expect, it } from 'vitest';
import {
  acceptedSubmissionSchema,
  normalizeLeetcodeUsername,
  toAcceptedSubmission,
} from './leetcode.js';

const acceptedPayload = {
  submissionId: '123456789',
  leetcodeUsername: 'LeetCodeUser',
  status: 'Accepted',
  problemTitle: 'Example',
  titleSlug: 'example',
  frontendId: '1',
  difficulty: 'Easy',
  topicTags: ['Array'],
  language: 'python3',
  sourceCode: 'print(1)',
  runtime: '4 ms',
  memory: '16.2 MB',
  submittedAt: 1_700_000_000,
};

describe('browser-captured LeetCode submissions', () => {
  it('normalizes the account name used for extension matching', () => {
    expect(normalizeLeetcodeUsername('  @Example_User ')).toBe('example_user');
  });

  it('accepts a complete Accepted payload and converts its timestamp', () => {
    const parsed = acceptedSubmissionSchema.parse(acceptedPayload);
    const submission = toAcceptedSubmission(parsed);
    expect(submission).toMatchObject({
      submissionId: '123456789',
      leetcodeUsername: 'LeetCodeUser',
      problemNumber: 1,
      titleSlug: 'example',
      status: 'Accepted',
      topicTags: ['Array'],
      sourceCode: 'print(1)',
    });
    expect(submission.submittedAt.toISOString()).toBe(
      '2023-11-14T22:13:20.000Z',
    );
  });

  it('rejects non-Accepted results and incomplete solution details', () => {
    expect(() =>
      acceptedSubmissionSchema.parse({
        ...acceptedPayload,
        status: 'Wrong Answer',
      }),
    ).toThrow();
    expect(() =>
      acceptedSubmissionSchema.parse({ ...acceptedPayload, sourceCode: '' }),
    ).toThrow();
    expect(() =>
      acceptedSubmissionSchema.parse({
        ...acceptedPayload,
        difficulty: 'Unknown',
      }),
    ).toThrow();
  });

  it('rejects path traversal, invalid IDs, oversized code, and tag floods', () => {
    const hostileInputs = [
      { titleSlug: '../../README.md' },
      { submissionId: '../../etc/passwd' },
      { sourceCode: 'x'.repeat(500_001) },
      { topicTags: Array.from({ length: 101 }, () => 'Array') },
    ];
    for (const override of hostileInputs) {
      expect(() =>
        acceptedSubmissionSchema.parse({ ...acceptedPayload, ...override }),
      ).toThrow();
    }
  });

  it('rejects a non-numeric problem number and invalid timestamp', () => {
    expect(() =>
      toAcceptedSubmission(
        acceptedSubmissionSchema.parse({ ...acceptedPayload, frontendId: '0' }),
      ),
    ).toThrow('INVALID_PROBLEM_NUMBER');
    expect(() =>
      acceptedSubmissionSchema.parse({
        ...acceptedPayload,
        submittedAt: Number.NaN,
      }),
    ).toThrow();
  });

  it('rejects a forged future submission timestamp', () => {
    expect(() =>
      toAcceptedSubmission(
        acceptedSubmissionSchema.parse({
          ...acceptedPayload,
          submittedAt: Date.now() + 60 * 60 * 1000,
        }),
      ),
    ).toThrow('INVALID_SUBMISSION_TIME');
  });
});
