import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildNaverRouteUrl, naverRoutePlatform } from './naver-route';

const destination = {
  latitude: 37.302573,
  longitude: 127.072797,
  destinationName: '경기도 용인시 수지구 상현동 30-6',
  appUrl: 'https://15.165.235.154/collect',
};

test('iOS walking route uses the official app scheme, current-location origin, and encoded name', () => {
  const url = buildNaverRouteUrl({ ...destination, mode: 'walk', platform: 'ios' });
  assert.match(url, /^nmap:\/\/route\/walk\?/);
  assert.match(url, /dlat=37\.302573&dlng=127\.072797/);
  assert.match(url, new RegExp(`dname=${encodeURIComponent(destination.destinationName)}`));
  assert.match(url, /appname=https%3A%2F%2F15\.165\.235\.154%2F$/);
  assert.doesNotMatch(url, /[?&]slat=|[?&]slng=/);
});

test('Android driving route uses NAVER Intent URL with Maps app package fallback', () => {
  const url = buildNaverRouteUrl({ ...destination, mode: 'car', platform: 'android' });
  assert.match(url, /^intent:\/\/route\/car\?/);
  assert.match(url, /#Intent;scheme=nmap;action=android\.intent\.action\.VIEW;category=android\.intent\.category\.BROWSABLE;package=com\.nhn\.android\.nmap;end$/);
});

test('destination name is optional and coordinates or appname cannot be invalid', () => {
  assert.doesNotMatch(buildNaverRouteUrl({ ...destination, destinationName: null, mode: 'walk', platform: 'other' }), /dname=/);
  assert.throws(() => buildNaverRouteUrl({ ...destination, latitude: Number.NaN, mode: 'walk', platform: 'ios' }), RangeError);
  assert.throws(() => buildNaverRouteUrl({ ...destination, longitude: 0, mode: 'walk', platform: 'ios' }), RangeError);
  assert.throws(() => buildNaverRouteUrl({ ...destination, appUrl: 'javascript:alert(1)', mode: 'walk', platform: 'ios' }), TypeError);
});

test('platform detection distinguishes mobile browsers', () => {
  assert.equal(naverRoutePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'ios');
  assert.equal(naverRoutePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)', 5), 'ios');
  assert.equal(naverRoutePlatform('Mozilla/5.0 (Linux; Android 14)'), 'android');
  assert.equal(naverRoutePlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'other');
});
