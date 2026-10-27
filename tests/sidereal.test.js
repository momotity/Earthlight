/**
 * tests/sidereal.test.js — 恒星时与星空朝向
 *
 * GMST 有公认的基准点（J2000.0 = 280.4606°），恒星时每天比太阳时快约 3m56s。
 * 这些是硬指标，对不上就说明星空的方位整片是错的。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { gmstDeg, skyRotationY, skyTimestamp } from '../src/astronomy/sidereal.js';
import { norm360, D2R, TAU } from '../src/lib/math.js';
import { solarPosition } from '../src/astronomy/solar.js';

const DAY = 86400000;

test('J2000.0 历元的 GMST = 280.4606°（18h 41m 50s）', () => {
  const got = gmstDeg(Date.UTC(2000, 0, 1, 12));
  assert.ok(Math.abs(got - 280.4606) < 0.01, `J2000 GMST ${got.toFixed(4)}° 应为 280.4606°`);
});

test('恒星日比太阳日短约 3m56s（每天快 0.9856°）', () => {
  const t0 = Date.UTC(2026, 5, 1, 0);
  const d1 = norm360(gmstDeg(t0 + DAY) - gmstDeg(t0));
  assert.ok(Math.abs(d1 - 0.9856) < 0.005, `一太阳日的 GMST 增量 ${d1.toFixed(4)}° 应约 0.9856°`);

  // 无误差累积：隔一年也应回到同一相位附近
  const d365 = norm360(gmstDeg(t0 + 365 * DAY) - gmstDeg(t0));
  const expect = norm360(365 * 0.98564736629);
  assert.ok(Math.abs(d365 - expect) < 0.01);
});

test('GMST 每小时增长 ≈ 15.0411°', () => {
  const t0 = Date.UTC(2026, 0, 15, 0);
  let prev = gmstDeg(t0);
  for (let h = 1; h <= 12; h++) {
    const cur = gmstDeg(t0 + h * 3600000);
    const delta = norm360(cur - prev);
    assert.ok(Math.abs(delta - 15.0411) < 0.002, `第 ${h} 小时增量 ${delta.toFixed(4)}°`);
    prev = cur;
  }
});

test('GMST 输出始终落在 [0, 360)', () => {
  for (let k = 0; k < 400; k++) {
    const v = gmstDeg(Date.UTC(1990, 0, 1) + k * 7.3 * DAY);
    assert.ok(v >= 0 && v < 360, `${v} 越界`);
  }
});

test('skyRotationY = −(GMST + 直射经度)，取最短弧', () => {
  const ms = Date.UTC(2026, 9, 27, 16);
  for (const subLon of [-180, -118.1, 0, 33.5, 116.4, 179.9]) {
    const got = skyRotationY(ms, subLon);
    const want = -norm360(gmstDeg(ms) + subLon) * D2R;
    assert.ok(Math.abs(got - want) < 1e-12, `subLon=${subLon} 不一致`);
    assert.ok(got >= -TAU && got <= 0, `${got} 应在 [−2π, 0]`);
  }
});

test('星空与太阳的对应关系：太阳赤经 = GMST + 直射经度', () => {
  // 这是整个星空对齐的前提。赤经（小时）：春分≈0、夏至≈6、秋分≈12、冬至≈18
  const cases = [
    ['春分', 79, 0, 0.15],
    ['夏至', 172, 6, 0.15],
    ['秋分', 266, 12, 0.15],
    ['冬至', 355, 18, 0.15]
  ];
  for (const [name, doy, wantH, tol] of cases) {
    const sol = solarPosition(doy, 12);
    const ts = skyTimestamp(2026, doy, 12);
    const alphaH = norm360(gmstDeg(ts) + sol.subLon) / 15;
    // 18h 与 0h 相邻，做环形比较
    const diff = Math.min(Math.abs(alphaH - wantH), 24 - Math.abs(alphaH - wantH));
    assert.ok(diff < tol, `${name} 太阳赤经 ${alphaH.toFixed(3)}h 偏离 ${wantH}h 超过 ${tol}h`);
  }
});

test('skyTimestamp 与 doy / UTC 小时一致', () => {
  const jan1 = skyTimestamp(2026, 1, 0);
  assert.equal(jan1, Date.UTC(2026, 0, 1, 0));

  const dec31 = skyTimestamp(2026, 365, 23.5);
  assert.equal(dec31, Date.UTC(2026, 0, 1) + 364 * DAY + 23.5 * 3600000);

  // 一天内平移，GMST 增量应约为 360.9856°（转一圈多一点）
  const a = gmstDeg(skyTimestamp(2026, 100, 0));
  const b = gmstDeg(skyTimestamp(2026, 101, 0));
  assert.ok(Math.abs(norm360(b - a) - 0.9856) < 0.005, '跨日增量应约 0.9856°');
});
