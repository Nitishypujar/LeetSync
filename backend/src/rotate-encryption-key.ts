import { getEnv } from './config.js';
import { prisma } from './db.js';
import { rotateEncryptedSecret } from './crypto.js';

const env = getEnv();
if (!env.TOKEN_ENCRYPTION_KEY_PREVIOUS) {
  throw new Error(
    'Set TOKEN_ENCRYPTION_KEY_PREVIOUS to the old key before running this command.',
  );
}
if (
  env.TOKEN_ENCRYPTION_KEY_PREVIOUS.toLowerCase() ===
  env.TOKEN_ENCRYPTION_KEY.toLowerCase()
) {
  throw new Error(
    'The previous and current encryption keys must be different.',
  );
}

try {
  const tokens = await prisma.githubToken.findMany({
    select: {
      userId: true,
      accessTokenEnc: true,
      refreshTokenEnc: true,
    },
  });
  let rotated = 0;
  let changedDuringRotation = 0;

  for (const token of tokens) {
    const accessTokenEnc = rotateEncryptedSecret(token.accessTokenEnc);
    const refreshTokenEnc = token.refreshTokenEnc
      ? rotateEncryptedSecret(token.refreshTokenEnc)
      : null;
    if (
      accessTokenEnc === token.accessTokenEnc &&
      refreshTokenEnc === token.refreshTokenEnc
    ) {
      continue;
    }
    const result = await prisma.githubToken.updateMany({
      where: {
        userId: token.userId,
        accessTokenEnc: token.accessTokenEnc,
        refreshTokenEnc: token.refreshTokenEnc,
      },
      data: { accessTokenEnc, refreshTokenEnc },
    });
    if (result.count === 1) rotated += 1;
    else changedDuringRotation += 1;
  }

  console.log(
    JSON.stringify({
      level: 'info',
      message: 'GitHub token encryption key rotation completed',
      recordsUpdated: rotated,
      recordsChecked: tokens.length,
      recordsChangedDuringRotation: changedDuringRotation,
    }),
  );
} finally {
  await prisma.$disconnect();
}
