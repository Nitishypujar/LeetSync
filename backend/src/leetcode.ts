import { z } from 'zod';

export const acceptedSubmissionSchema = z.object({
  submissionId: z.string().regex(/^\d{1,20}$/),
  leetcodeUsername: z
    .string()
    .trim()
    .min(1)
    .max(39)
    .regex(/^[A-Za-z0-9_-]+$/),
  status: z.literal('Accepted'),
  problemTitle: z.string().trim().min(1).max(500),
  titleSlug: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/),
  frontendId: z.string().trim().min(1).max(12).regex(/^\d+$/),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  topicTags: z.array(z.string().trim().min(1).max(100)).max(100),
  language: z.string().trim().min(1).max(100),
  sourceCode: z.string().min(1).max(500_000),
  runtime: z.string().trim().max(100).default(''),
  memory: z.string().trim().max(100).default(''),
  submittedAt: z.union([z.string().datetime({ offset: true }), z.number()]),
});

export type AcceptedSubmissionInput = z.infer<typeof acceptedSubmissionSchema>;

export type AcceptedSubmission = Omit<
  AcceptedSubmissionInput,
  'submittedAt' | 'frontendId'
> & {
  problemNumber: number;
  submittedAt: Date;
};

export function normalizeLeetcodeUsername(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export function toAcceptedSubmission(
  input: AcceptedSubmissionInput,
): AcceptedSubmission {
  const problemNumber = Number(input.frontendId);
  const milliseconds =
    typeof input.submittedAt === 'number'
      ? input.submittedAt < 10_000_000_000
        ? input.submittedAt * 1000
        : input.submittedAt
      : Date.parse(input.submittedAt);
  const submittedAt = new Date(milliseconds);
  if (!Number.isSafeInteger(problemNumber) || problemNumber <= 0) {
    throw new Error('INVALID_PROBLEM_NUMBER');
  }
  if (
    Number.isNaN(submittedAt.getTime()) ||
    submittedAt.getTime() <= 0 ||
    submittedAt.getTime() > Date.now() + 5 * 60_000
  ) {
    throw new Error('INVALID_SUBMISSION_TIME');
  }
  return {
    ...input,
    problemNumber,
    submittedAt,
  };
}
