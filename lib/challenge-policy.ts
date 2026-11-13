export type AttemptChallenge = {
  consumedAt: Date | null;
  expiresAt: Date;
  attempts: number;
};

export type RecoveryToken = {
  usedAt: Date | null;
  expiresAt: Date;
};

export const isOpenChallenge = <T extends AttemptChallenge>(challenge: T | null, now = Date.now()): challenge is T => {
  if (!challenge || challenge.consumedAt) return false;
  if (challenge.expiresAt.getTime() <= now) return false;
  if (challenge.attempts >= 5) return false;
  return true;
};

export const nextFailedAttempt = (attempts: number) => ({
  attempts: attempts + 1,
  consumed: attempts + 1 >= 5,
});

export const isUsableRecoveryToken = <T extends RecoveryToken>(token: T | null, now = Date.now()): token is T => {
  if (!token || token.usedAt) return false;
  return token.expiresAt.getTime() > now;
};
