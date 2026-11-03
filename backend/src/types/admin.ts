export interface AdminProfile {
  id: string;
  email: string;
  name: string;
  // Database accounts carry their stored scope; development mocks grant no production role.
  role?: 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'COLLECTOR';
  tenantId?: string | null;
}

export interface AdminRecord extends AdminProfile {
  passwordHash: string;
  active: boolean;
}

export interface AdminSession {
  tokenHash: string;
  adminId: string;
  expiresAt: number;
  revokedAt: number | null;
}
