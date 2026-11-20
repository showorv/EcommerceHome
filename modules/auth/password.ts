import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id password hashing (NFR-SEC-01). Parameters follow OWASP's recommendation
 * (m=19 MiB, t=2, p=1). Better Auth calls these instead of its default scrypt.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, algorithm: 2 /* Argon2id */ } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword({ hash: stored, password }: { hash: string; password: string }): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}
