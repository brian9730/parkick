export const REPORT_CLUSTER_RADIUS = 56;

interface ReportCoordinates { latitude: number; longitude: number }
interface ScreenPoint { x: number; y: number }

export interface ReportMapCluster<Report extends ReportCoordinates> {
  reports: Report[];
  latitude: number;
  longitude: number;
  hasDistinctPositions: boolean;
}

/** Cluster by the current map projection, so zooming separates nearby locations.
 * Connected components also group chains of overlapping markers. Input records
 * and their real coordinates are never changed; only the displayed center moves.
 */
export function clusterMapReports<Report extends ReportCoordinates>(
  reports: readonly Report[],
  project: (report: Report) => ScreenPoint,
  radius = REPORT_CLUSTER_RADIUS,
): ReportMapCluster<Report>[] {
  const points = reports.map(project);
  if (!Number.isFinite(radius) || radius < 0 || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    throw new Error('Invalid map projection');
  }
  const parents = reports.map((_, index) => index);
  function root(index: number): number {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  }
  const distanceSquared = radius * radius;
  // At most 200 reports are loaded per page, keeping the pairwise check bounded.
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      const dx = points[left].x - points[right].x;
      const dy = points[left].y - points[right].y;
      if (dx * dx + dy * dy <= distanceSquared) parents[root(right)] = root(left);
    }
  }
  const groups = new Map<number, Report[]>();
  reports.forEach((report, index) => {
    const key = root(index);
    const group = groups.get(key);
    if (group) group.push(report); else groups.set(key, [report]);
  });
  return [...groups.values()].map(group => ({
    reports: group,
    latitude: group.reduce((sum, report) => sum + report.latitude, 0) / group.length,
    longitude: group.reduce((sum, report) => sum + report.longitude, 0) / group.length,
    hasDistinctPositions: group.some(report => report.latitude !== group[0].latitude || report.longitude !== group[0].longitude),
  }));
}
