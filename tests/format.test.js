/**
 * tests/format.test.js — 时间与日期的格式化
 *
 * 这类函数最容易在「跨零点」「负数」「2 月 29 日」上翻车，而一旦翻车就是
 * 卡片上显示「25:00」这种明显的错，所以边界值全部列出来测。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  toLocalHour, tzLabel, hhmm, clockParts, latStr, lonStr,
  dayLengthStr, doyToLabel, doyToSeason, activeSeasonDoy, doyFromDate
} from '../src/astronomy/format.js';

test('toLocalHour 处理跨零点与时区', () => {
  assert.equal(toLocalHour(12, 0), 12);
  assert.equal(toLocalHour(20, 8), 4, '20 UTC 在东八区应是次日 4 点');
  assert.equal(toLocalHour(4, -8), 20, '4 UTC 在西八区应是前一天 20 点');
  assert.equal(toLocalHour(12, null), 12, '缺时区按 UTC 处理');
  assert.ok(toLocalHour(23.9, 12) < 24 && toLocalHour(0.1, -12) >= 0);
});

test('tzLabel 输出 UTC±H[:MM]', () => {
  assert.equal(tzLabel(8), 'UTC+8');
  assert.equal(tzLabel(-5), 'UTC-5');
  assert.equal(tzLabel(5.5), 'UTC+5:30');
  assert.equal(tzLabel(-3.5), 'UTC-3:30');
  assert.equal(tzLabel(0), 'UTC+0');
  assert.equal(tzLabel(null), 'UTC');
});

test('hhmm 把越界与负数的小时折回 00:00–23:59', () => {
  assert.equal(hhmm(0), '00:00');
  assert.equal(hhmm(4.77), '04:46');
  assert.equal(hhmm(19.77), '19:46');
  assert.equal(hhmm(25), '01:00', '25 点应显示 01:00 而不是 25:00');
  assert.equal(hhmm(-1), '23:00');
  assert.equal(hhmm(23.999), '00:00', '四舍五入到 24:00 时要折回 00:00');
});

test('clockParts 不进位到天，分钟秒钟不越界', () => {
  const c = clockParts(25.5);
  assert.deepEqual(c, { hh: 1, mm: 30, ss: 0 });
  for (const h of [-3.2, 0, 6.999, 12.5, 23.9999]) {
    const p = clockParts(h);
    assert.ok(p.hh >= 0 && p.hh < 24, `hh=${p.hh}`);
    assert.ok(p.mm >= 0 && p.mm < 60, `mm=${p.mm}`);
    assert.ok(p.ss >= 0 && p.ss < 60, `ss=${p.ss}`);
  }
});

test('经纬度字符串带半球标记', () => {
  assert.equal(latStr(39.9042), '39.90°N');
  assert.equal(latStr(-33.8688), '33.87°S');
  assert.equal(lonStr(116.4074), '116.41°E');
  assert.equal(lonStr(-118.2437), '118.24°W');
});

test('dayLengthStr 分钟不出现 60', () => {
  assert.equal(dayLengthStr(12), '12h00m');
  assert.equal(dayLengthStr(14.5), '14h30m');
  assert.equal(dayLengthStr(0), '0h00m');
  assert.equal(dayLengthStr(24), '24h00m');
  // 59.9 分钟四舍五入到 60 时必须进位，不能显示成「9h60m」
  assert.equal(dayLengthStr(9.999), '10h00m');
  assert.equal(dayLengthStr(14.999), '15h00m');
  for (let v = 0; v <= 24; v += 0.013) {
    assert.ok(!/h60m/.test(dayLengthStr(v)), `${v} → ${dayLengthStr(v)}`);
  }
});

test('doyToLabel 覆盖每月 1 日与年末', () => {
  assert.equal(doyToLabel(1), '1月1日');
  assert.equal(doyToLabel(31), '1月31日');
  assert.equal(doyToLabel(32), '2月1日');
  assert.equal(doyToLabel(60), '3月1日', '非闰年第 60 天是 3 月 1 日');
  assert.equal(doyToLabel(172), '6月21日');
  assert.equal(doyToLabel(266), '9月23日');
  assert.equal(doyToLabel(365), '12月31日');
});

test('doyToSeason 的边界互不重叠也不留缝', () => {
  const boundaries = [1, 78, 79, 171, 172, 265, 266, 355, 356, 365];
  for (const d of boundaries) {
    assert.ok(['春季', '夏季', '秋季', '冬季'].includes(doyToSeason(d)), `doy=${d}`);
  }
  assert.equal(doyToSeason(79), '春季');
  assert.equal(doyToSeason(171), '春季');
  assert.equal(doyToSeason(172), '夏季');
  assert.equal(doyToSeason(266), '秋季');
  assert.equal(doyToSeason(356), '冬季');

  // 每天都必须能归到某一季
  for (let d = 1; d <= 365; d++) {
    assert.ok(activeSeasonDoy(d) > 0);
  }
  assert.equal(activeSeasonDoy(80), 79, '春分档');
  assert.equal(activeSeasonDoy(200), 172, '夏至档');
  assert.equal(activeSeasonDoy(300), 266, '秋分档');
  assert.equal(activeSeasonDoy(10), 356, '冬至档');
});

test('doyFromDate 按北京时间算「今天」', () => {
  // 2026-06-21 04:00 UTC = 北京时间 12:00，仍是 6/21 → doy 172
  assert.equal(doyFromDate(new Date(Date.UTC(2026, 5, 21, 4))), 172);
  // 2026-01-01 00:30 UTC = 北京 08:30 → 1 月 1 日
  assert.equal(doyFromDate(new Date(Date.UTC(2026, 0, 1, 0.5))), 1);
  // 2025-12-31 17:00 UTC = 北京 2026-01-01 01:00 → 落在新年的第 1 天
  assert.equal(doyFromDate(new Date(Date.UTC(2025, 11, 31, 17))), 1);
  // 输出必须被夹在 1..365
  for (const m of [0, 3, 6, 9, 11]) {
    for (const day of [1, 15, 28]) {
      const d = doyFromDate(new Date(Date.UTC(2026, m, day)));
      assert.ok(d >= 1 && d <= 365, `${m}/${day} → ${d}`);
    }
  }
});
