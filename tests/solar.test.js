/**
 * tests/solar.test.js — 太阳位置算法的回归测试
 *
 * 期望值取自天文年历/常识（春分秋分赤纬≈0、二至≈±23.44°、赤道春分昼夜等长…），
 * 不依赖本项目任何其他代码，改算法时能立刻发现回归。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { solarPosition, altitude, daylight, daylightPhase } from '../src/astronomy/solar.js';
import { R2D, normLon } from '../src/lib/math.js';

const DEG = (v) => v * R2D;

test('四个节气的太阳赤纬落在真实值附近', () => {
  const cases = [
    ['春分', 79, 0, 0.7],       // 3/20 前后，赤纬过零
    ['夏至', 172, 23.44, 0.1],  // 6/21 前后，北回归线
    ['秋分', 266, 0, 0.7],
    ['冬至', 355, -23.44, 0.1]
  ];
  for (const [name, doy, want, tol] of cases) {
    const got = DEG(solarPosition(doy, 12).decl);
    assert.ok(Math.abs(got - want) < tol, `${name}赤纬 ${got.toFixed(3)}° 偏离 ${want}° 超过 ${tol}°`);
  }
});

test('赤纬全年不超过 ±23.5°，且夏至最大、冬至最小', () => {
  let min = Infinity;
  let max = -Infinity;
  for (let doy = 1; doy <= 365; doy++) {
    const d = DEG(solarPosition(doy, 12).decl);
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  assert.ok(max > 23.3 && max < 23.5, `全年最大赤纬 ${max.toFixed(3)}° 不合理`);
  assert.ok(min < -23.3 && min > -23.5, `全年最小赤纬 ${min.toFixed(3)}° 不合理`);
});

test('时差（EoT）全年落在 ±17 分钟内', () => {
  // 真实极值：2 月约 −14.2 min，11 月初约 +16.4 min
  let min = Infinity;
  let max = -Infinity;
  for (let doy = 1; doy <= 365; doy++) {
    const e = solarPosition(doy, 12).eot;
    min = Math.min(min, e);
    max = Math.max(max, e);
  }
  assert.ok(min > -16 && min < -13, `EoT 最小 ${min.toFixed(2)} min 不合理`);
  assert.ok(max > 15 && max < 17.5, `EoT 最大 ${max.toFixed(2)} min 不合理`);
});

test('直射点经度：UTC 12 时≈0°，UTC 0 时≈±180°（相差 15°/小时）', () => {
  const noon = solarPosition(79, 12).subLon;
  assert.ok(Math.abs(noon) < 5, `UTC12 直射经度 ${noon.toFixed(2)}° 应接近 0`);

  const mid = solarPosition(79, 0).subLon;
  assert.ok(Math.abs(Math.abs(mid) - 180) < 5, `UTC0 直射经度 ${mid.toFixed(2)}° 应接近 ±180`);

  // 每小时西移 15°（经度减小）
  const a = solarPosition(79, 6).subLon;
  const b = solarPosition(79, 7).subLon;
  assert.ok(Math.abs(normLon(a - b) - 15) < 0.2, `每小时位移 ${(a - b).toFixed(2)}° 应约 15°`);
});

test('直射点上太阳高度为 90°', () => {
  const s = solarPosition(172, 12);
  const alt = DEG(altitude(DEG(s.decl), s.subLon, s.decl, s.subLon));
  assert.ok(Math.abs(alt - 90) < 1e-6, `直射点高度角 ${alt.toFixed(6)}° 应为 90°`);
});

test('赤道上春分昼夜基本等长', () => {
  const s = solarPosition(79, 12);
  const d = daylight(0, s.decl, 0, s.eot, 0);
  assert.equal(d.polar, null);
  assert.ok(Math.abs(d.dayLen - 12) < 0.4, `赤道春分昼长 ${d.dayLen.toFixed(3)}h 应约 12h`);
});

test('极昼 / 极夜判定', () => {
  const summer = solarPosition(172, 12);
  const winter = solarPosition(355, 12);
  assert.equal(daylight(80, summer.decl, 0, summer.eot, 0).polar, '极昼');
  assert.equal(daylight(80, winter.decl, 0, winter.eot, 0).polar, '极夜');
  // 北极圈（66.5°N）夏至也应是极昼
  assert.equal(daylight(66.6, summer.decl, 0, summer.eot, 0).polar, '极昼');
  // 中纬度不应出现极昼极夜
  assert.equal(daylight(39.9, summer.decl, 116.4, summer.eot, 8).polar, null);
});

test('日出日落满足 setH − riseH = 昼长', () => {
  const s = solarPosition(172, 12);
  for (const lat of [-60, -30, 0, 23.4, 39.9, 60]) {
    const d = daylight(lat, s.decl, 100, s.eot, 8);
    if (d.polar) continue;
    assert.ok(Math.abs((d.setH - d.riseH) - d.dayLen) < 1e-9,
      `纬度 ${lat}：setH−riseH=${(d.setH - d.riseH).toFixed(4)} 与昼长 ${d.dayLen.toFixed(4)} 不符`);
  }
});

test('北京夏至 / 冬至的日出日落时刻（对照天文年历）', () => {
  // 真实值约：夏至 04:46 / 19:46，冬至 07:33 / 16:53（北京时间）
  const sum = solarPosition(172, 12);
  const win = solarPosition(355, 12);
  const s = daylight(39.9, sum.decl, 116.4, sum.eot, 8);
  const w = daylight(39.9, win.decl, 116.4, win.eot, 8);

  assert.ok(Math.abs(s.riseH - 4.77) < 0.2, `夏至日出 ${s.riseH.toFixed(2)}h 偏离 4.77h`);
  assert.ok(Math.abs(s.setH - 19.77) < 0.2, `夏至日落 ${s.setH.toFixed(2)}h 偏离 19.77h`);
  assert.ok(w.dayLen < s.dayLen, '冬至昼长必须短于夏至');
  assert.ok(Math.abs(w.dayLen - 9.3) < 0.3, `冬至昼长 ${w.dayLen.toFixed(2)}h 偏离 9.3h`);
});

test('南北半球季节相反：同一天悉尼与北京昼长互补方向相反', () => {
  const s = solarPosition(172, 12);
  const bj = daylight(39.9, s.decl, 116.4, s.eot, 8);
  const syd = daylight(-33.9, s.decl, 151.2, s.eot, 10);
  assert.ok(bj.dayLen > 13, '北京夏至应昼长夜短');
  assert.ok(syd.dayLen < 11, '悉尼同日应昼短夜长');
  // 同纬度南北对称，昼长相加应为 24h
  const north = daylight(39.9, s.decl, 0, s.eot, 0).dayLen;
  const south = daylight(-39.9, s.decl, 0, s.eot, 0).dayLen;
  assert.ok(Math.abs(north + south - 24) < 1e-6, `${north.toFixed(3)} + ${south.toFixed(3)} ≠ 24`);
});

test('daylightPhase 区分白昼 / 黑夜 / 晨昏', () => {
  assert.equal(daylightPhase(45, 0, 0).key, 'day');
  assert.equal(daylightPhase(-45, 0, 0).key, 'night');
  assert.equal(daylightPhase(0, 0, -5).text, '日出中', '太阳在东方（时角为负）应是日出');
  assert.equal(daylightPhase(0, 0, 5).text, '日落中', '太阳在西方（时角为正）应是日落');
});
