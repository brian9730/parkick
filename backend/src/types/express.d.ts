import type { AdminProfile } from './admin.js';

declare global {
  namespace Express {
    interface Locals {
      requestId: string;
      admin?: AdminProfile;
    }
  }
}

export {};
