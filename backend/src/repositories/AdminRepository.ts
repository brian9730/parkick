import type { AdminRecord } from '../types/admin.js';

export interface AdminRepository {
  findByEmail(email: string): Promise<AdminRecord | null>;
  findById(id: string): Promise<AdminRecord | null>;
}

/** MOCK: one process-local development account. No database or production authentication. */
export class MockAdminRepository implements AdminRepository {
  constructor(private readonly account: AdminRecord) {}

  async findByEmail(email: string): Promise<AdminRecord | null> {
    return this.account.email === email ? this.account : null;
  }

  async findById(id: string): Promise<AdminRecord | null> {
    return this.account.id === id ? this.account : null;
  }
}
