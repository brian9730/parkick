import { distanceMeters } from './relatedReportRules.js';

export const HOTSPOT_DISTANCE_METERS = 150;
const EARTH_RADIUS_METERS = 6_371_000;
// Every point in a 75 m cube is within 150 m of every other point in that cube.
const CELL_METERS = HOTSPOT_DISTANCE_METERS / 2;
const CHORD_METERS = 2 * EARTH_RADIUS_METERS * Math.sin(HOTSPOT_DISTANCE_METERS / (2 * EARTH_RADIUS_METERS));

export interface HotspotPoint { latitude: number; longitude: number }
export interface HotspotZone extends HotspotPoint {
  count: number;
  level: 'red' | 'yellow';
  radiusMeters: number;
}

interface SpatialPoint extends HotspotPoint { x: number; y: number; z: number }
interface Cell { x: number; y: number; z: number; members: number[] }

function valid(point: HotspotPoint): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
}

function spatial(point: HotspotPoint): SpatialPoint {
  const latitude = point.latitude * Math.PI / 180;
  const longitude = point.longitude * Math.PI / 180;
  const horizontal = EARTH_RADIUS_METERS * Math.cos(latitude);
  return { ...point, x: horizontal * Math.cos(longitude), y: horizontal * Math.sin(longitude), z: EARTH_RADIUS_METERS * Math.sin(latitude) };
}

function cellKey(x: number, y: number, z: number): string { return `${x},${y},${z}`; }

/** Groups all valid coordinates by 150 m single-link distance; each report belongs to exactly one group. */
export function reportHotspots(input: readonly HotspotPoint[]): { zones: HotspotZone[]; totalReports: number } {
  const points = input.filter(valid).sort((left, right) => left.latitude - right.latitude || left.longitude - right.longitude).map(spatial);
  const parent = points.map((_point, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[index] !== index) { const next = parent[index]!; parent[index] = root; index = next; }
    return root;
  };
  const connect = (left: number, right: number) => { parent[find(right)] = find(left); };
  const cells = new Map<string, Cell>();
  for (const [index, point] of points.entries()) {
    const x = Math.floor(point.x / CELL_METERS), y = Math.floor(point.y / CELL_METERS), z = Math.floor(point.z / CELL_METERS);
    const key = cellKey(x, y, z);
    const cell = cells.get(key);
    if (cell) { connect(cell.members[0]!, index); cell.members.push(index); }
    else cells.set(key, { x, y, z, members: [index] });
  }
  const buckets = [...cells.values()];
  const bucketIndex = new Map(buckets.map((cell, index) => [cellKey(cell.x, cell.y, cell.z), index]));
  const thresholdSquared = CHORD_METERS ** 2;
  for (const [index, cell] of buckets.entries()) {
    for (let dx = -2; dx <= 2; dx += 1) for (let dy = -2; dy <= 2; dy += 1) for (let dz = -2; dz <= 2; dz += 1) {
      const otherIndex = bucketIndex.get(cellKey(cell.x + dx, cell.y + dy, cell.z + dz));
      if (otherIndex === undefined || otherIndex <= index) continue;
      const other = buckets[otherIndex]!;
      if (find(cell.members[0]!) === find(other.members[0]!)) continue;
      let joined = false;
      for (const first of cell.members) {
        const a = points[first]!;
        for (const second of other.members) {
          const b = points[second]!;
          if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 <= thresholdSquared) {
            connect(first, second); joined = true; break;
          }
        }
        if (joined) break;
      }
    }
  }
  const groups = new Map<number, SpatialPoint[]>();
  for (const [index, point] of points.entries()) {
    const root = find(index);
    const group = groups.get(root);
    if (group) group.push(point);
    else groups.set(root, [point]);
  }
  const zones: HotspotZone[] = [];
  for (const group of groups.values()) {
    if (group.length < 3) continue;
    const x = group.reduce((sum, point) => sum + point.x, 0);
    const y = group.reduce((sum, point) => sum + point.y, 0);
    const z = group.reduce((sum, point) => sum + point.z, 0);
    // An antipodal sum has no meaningful center. The first member is deterministic.
    const center = Math.hypot(x, y, z) < 1e-9
      ? { latitude: group[0]!.latitude, longitude: group[0]!.longitude }
      : { latitude: Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI, longitude: Math.atan2(y, x) * 180 / Math.PI };
    const farthest = group.reduce((meters, point) => Math.max(meters, distanceMeters(center, point)), HOTSPOT_DISTANCE_METERS);
    zones.push({ ...center, count: group.length, level: group.length >= 5 ? 'red' : 'yellow',
      radiusMeters: Math.ceil(farthest) });
  }
  zones.sort((left, right) => right.count - left.count || left.latitude - right.latitude || left.longitude - right.longitude);
  return { zones, totalReports: points.length };
}
