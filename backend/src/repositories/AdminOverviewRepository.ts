/** Phase 1 contract only. No report data exists and zero must not imply measured statistics. */
export interface DashboardSkeleton {
  mode: 'skeleton';
  summary: { today: null; total: null; received: null; processing: null; completed: null };
  recentReports: never[];
  byCategory: never[];
  byOperator: never[];
  byRegion: never[];
  dailyTrend: never[];
  mapMarkers: never[];
}

export interface AdminOverviewRepository {
  getDashboard(): Promise<DashboardSkeleton>;
  getReports(page: number, pageSize: number): Promise<{ mode: 'skeleton'; items: never[]; total: 0; page: number; pageSize: number }>;
}

/** MOCK: empty skeleton responses; no database reads or fabricated reports. */
export class EmptyAdminOverviewRepository implements AdminOverviewRepository {
  async getDashboard(): Promise<DashboardSkeleton> {
    return {
      mode: 'skeleton',
      summary: { today: null, total: null, received: null, processing: null, completed: null },
      recentReports: [], byCategory: [], byOperator: [], byRegion: [], dailyTrend: [], mapMarkers: [],
    };
  }

  async getReports(page: number, pageSize: number) {
    return { mode: 'skeleton' as const, items: [] as never[], total: 0 as const, page, pageSize };
  }
}
