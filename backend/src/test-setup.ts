process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/leetsync_test';
process.env.SESSION_SECRET ??=
  'test-session-secret-which-is-long-enough-123456';
process.env.TOKEN_ENCRYPTION_KEY ??=
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.GITHUB_CLIENT_ID ??= 'test-client';
process.env.GITHUB_CLIENT_SECRET ??= 'test-secret';
process.env.GITHUB_CALLBACK_URL ??=
  'http://localhost:3000/api/auth/github/callback';
process.env.FRONTEND_ORIGIN ??= 'http://localhost:5173';
