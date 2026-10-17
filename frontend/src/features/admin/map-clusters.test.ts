import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clusterMapReports, REPORT_CLUSTER_RADIUS } from './map-clusters';

const point = (id: string, x: number, y: number) => ({ id, longitude: x, latitude: y });
const project = (report: ReturnType<typeof point>) => ({ x: report.longitude, y: report.latitude });

test('nearby different locations combine and separate as the map projection zooms in', () => {
  const reports = [point('a', 0, 0), point('b', 20, 10), point('far', 300, 300)];
  assert.deepEqual(clusterMapReports(reports, project).map(cluster => cluster.reports.map(report => report.id)), [['a', 'b'], ['far']]);
  const zoomed = clusterMapReports(reports, report => ({ x: report.longitude * 4, y: report.latitude * 4 }));
  assert.deepEqual(zoomed.map(cluster => cluster.reports.map(report => report.id)), [['a'], ['b'], ['far']]);
  assert.deepEqual(clusterMapReports(reports, project).map(cluster => cluster.reports.length), [2, 1]);
});

test('identical coordinates preserve every report and never require a separating zoom', () => {
  const reports = [point('a', 1, 1), point('b', 1, 1), point('c', 1, 1)];
  for (const scale of [1, 10_000]) {
    const clusters = clusterMapReports(reports, report => ({ x: report.longitude * scale, y: report.latitude * scale }));
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].reports.length, 3);
    assert.equal(clusters[0].hasDistinctPositions, false);
  }
});

test('chains of overlapping markers are counted once including exact duplicates', () => {
  const reports = [point('a', 0, 0), point('b', 50, 0), point('c', 100, 0), point('d', 50, 0), point('e', 300, 0)];
  const clusters = clusterMapReports(reports, project);
  assert.deepEqual(clusters.map(cluster => cluster.reports.length), [4, 1]);
  assert.equal(clusters[0].hasDistinctPositions, true);
  assert.deepEqual(clusters.flatMap(cluster => cluster.reports.map(report => report.id)).sort(), reports.map(report => report.id).sort());
});

test('the threshold is a screen distance and does not depend on map translation', () => {
  const boundary = [point('a', 0, 0), point('b', REPORT_CLUSTER_RADIUS, 0)];
  assert.equal(clusterMapReports(boundary, project).length, 1);
  assert.equal(clusterMapReports([point('a', 0, 0), point('b', REPORT_CLUSTER_RADIUS + 0.01, 0)], project).length, 2);
  assert.equal(clusterMapReports([point('a', 0, 0), point('b', 40, 40)], project).length, 2);
  assert.equal(clusterMapReports(boundary, report => ({ x: report.longitude - 1000, y: report.latitude + 3000 })).length, 1);
});

test('cluster centers do not mutate persisted coordinates, records, or input ordering', () => {
  const reports = Object.freeze([Object.freeze(point('b', 20, 10)), Object.freeze(point('a', 0, 0))]);
  const clusters = clusterMapReports(reports, project);
  assert.equal(clusters[0].longitude, 10);
  assert.equal(clusters[0].latitude, 5);
  assert.notEqual(clusters[0].reports, reports);
  assert.equal(clusters[0].reports[0], reports[0]);
  assert.deepEqual(reports, [point('b', 20, 10), point('a', 0, 0)]);
});

test('empty pages and unusable projection results are handled explicitly', () => {
  assert.deepEqual(clusterMapReports([], project), []);
  assert.throws(() => clusterMapReports([point('a', 0, 0)], () => ({ x: Number.NaN, y: 0 })), /Invalid map projection/);
  assert.throws(() => clusterMapReports([point('a', 0, 0)], project, -1), /Invalid map projection/);
});
