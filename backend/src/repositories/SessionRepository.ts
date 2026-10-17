import type { AdminSession } from '../types/admin.js';

export interface SessionRepository {
  find(tokenHash: string): Promise<AdminSession | null>;
  save(session: AdminSession): Promise<void>;
  delete(tokenHash: string): Promise<void>;
}

/** MOCK: sessions reset when the development server restarts. Store only token digests. */
export class MockSessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, AdminSession>();

  async find(tokenHash: string): Promise<AdminSession | null> {
    const session = this.sessions.get(tokenHash);
    if (!session) return null;
    if (session.expiresAt <= Date.now() || session.revokedAt !== null) {
      this.sessions.delete(tokenHash);
      return null;
    }
    return session;
  }

  async save(session: AdminSession): Promise<void> {
    for (const [key, current] of this.sessions) {
      if (current.expiresAt <= Date.now()) this.sessions.delete(key);
    }
    // Bound memory even in a long-running development process.
    if (this.sessions.size >= 1000) {
      const oldest = this.sessions.keys().next().value;
      if (oldest) this.sessions.delete(oldest);
    }
    this.sessions.set(session.tokenHash, session);
  }

  async delete(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }
}
