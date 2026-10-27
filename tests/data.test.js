/**
 * tests/data.test.js — 自动生成的数据集完整性
 *
 * src/data/*.js 由 tools/*.py 生成，人不会去读那几万个数字。
 * 这些断言就是「生成脚本有没有写坏」的唯一防线：
 * 坐标系越界、字段缺失、重复、时区错位，全在渲染前就能拦下来。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import CITIES from '../src/data/cities.js';
import SKY from '../src/data/sky.js';
import { normLon } from '../src/lib/math.js';

test('城市表：条目数量与字段结构', () => {
  assert.ok(Array.isArray(CITIES) && CITIES.length > 300, `只有 ${CITIES.length} 个城市，太少`);

  for (const c of CITIES) {
    assert.equal(c.length, 6, `${c[0]} 字段数 ${c.length}，应为 6`);
    assert.equal(typeof c[0], 'string');
    assert.ok(c[0].length > 0, '城市名不能为空');
    assert.equal(typeof c[2], 'number', `${c[0]} 纬度不是数字`);
    assert.equal(typeof c[3], 'number', `${c[0]} 经度不是数字`);
    assert.equal(typeof c[5], 'number', `${c[0]} 时区不是数字`);
  }
});

test('城市表：经纬度与时区都在物理合理范围内', () => {
  for (const [name, , lat, lon, , tz] of CITIES) {
    assert.ok(lat >= -90 && lat <= 90, `${name} 纬度 ${lat} 越界`);
    assert.ok(lon >= -180 && lon <= 180, `${name} 经度 ${lon} 越界`);
    assert.ok(tz >= -12 && tz <= 14, `${name} 时区 ${tz} 越界`);
    // 现实中有半小时/四分之一小时时区（伊朗 +3:30、印度 +5:30、尼泊尔 +5:45）
    assert.equal(Math.round(tz * 4) / 4, tz, `${name} 时区 ${tz} 不是 15 分钟的整数倍`);
  }
});

test('城市表：时区与经度大致吻合（误差不超过 4 小时）', () => {
  // 现实中确有偏差（中国全境用东八区、西班牙用中欧时间），但不会离谱
  const bad = [];
  for (const [name, , , lon, , tz] of CITIES) {
    const solar = normLon(lon) / 15;
    if (Math.abs(solar - tz) > 4) bad.push(`${name} lon=${lon} tz=${tz}`);
  }
  assert.deepEqual(bad, [], '时区与经度明显错位：' + bad.join(', '));
});

test('城市表：名称与坐标不重复', () => {
  const names = new Set();
  const spots = new Set();
  for (const [name, , lat, lon] of CITIES) {
    assert.ok(!names.has(name), `城市名重复：${name}`);
    names.add(name);
    const key = lat.toFixed(2) + ',' + lon.toFixed(2);
    assert.ok(!spots.has(key), `坐标重复：${name} @ ${key}`);
    spots.add(key);
  }
});

test('城市表：中国城市占多数且时区为 8', () => {
  const cn = CITIES.filter((c) => c[5] === 8);
  assert.ok(cn.length > 200, `东八区城市只有 ${cn.length} 个`);
  // 中国最西的喀什（75.99°E）最东的抚远（134.3°E）都应在表里
  const lons = cn.map((c) => c[3]);
  assert.ok(Math.min(...lons) < 80, '缺少新疆西部城市');
  assert.ok(Math.max(...lons) > 130, '缺少黑龙江东部城市');
});

test('星空表：星点是 [ra, dec, mag, bv] 四元组', () => {
  const s = SKY.stars;
  assert.ok(Array.isArray(s));
  assert.equal(s.length % 4, 0, `星点数组长度 ${s.length} 不是 4 的倍数`);
  assert.ok(s.length / 4 > 4000, `只有 ${s.length / 4} 颗星`);

  let nBright = 0;
  let prevRa = null;
  for (let i = 0; i < s.length; i += 4) {
    const [ra, dec, mag, bv] = [s[i], s[i + 1], s[i + 2], s[i + 3]];
    // 赤经沿用数据源的 (−180, 180] 表示法（d3-celestial 原样）
    assert.ok(Number.isFinite(ra) && ra >= -180 && ra <= 180, `第 ${i / 4} 颗赤经 ${ra} 越界`);
    assert.ok(Number.isFinite(dec) && dec >= -90 && dec <= 90, `第 ${i / 4} 颗赤纬 ${dec} 越界`);
    assert.ok(Number.isFinite(mag) && mag > -2 && mag < 7.5, `第 ${i / 4} 颗星等 ${mag}`);
    assert.ok(Number.isFinite(bv) && bv > -1 && bv < 3.5, `第 ${i / 4} 颗 B−V ${bv}`);
    if (mag < 1.5) nBright++;

    if (prevRa !== null) {
      // 应当按赤经环绕排序；源数据有 ±0.01° 的四舍五入级乱序，给 0.2° 余量
      assert.ok(normLon(ra - prevRa) > -0.2,
        `第 ${i / 4} 颗赤经顺序异常：${prevRa} → ${ra}`);
    }
    prevRa = ra;
  }
  assert.ok(nBright > 20, `亮于 1.5 等的星只有 ${nBright} 颗，星表可能被截断`);
});

test('星空表：星座连线是扁平成对的 [ra, dec, ra, dec, …]', () => {
  assert.ok(Array.isArray(SKY.lines) && SKY.lines.length > 100, `连线条数只有 ${SKY.lines.length}`);
  let segs = 0;
  for (const seg of SKY.lines) {
    assert.ok(Array.isArray(seg), '每条连线应是扁平数组');
    assert.equal(seg.length % 2, 0, '一条连线的坐标个数必须是偶数');
    assert.ok(seg.length >= 4, '一条连线至少要有两个端点');
    for (let i = 0; i < seg.length; i += 2) {
      assert.ok(Number.isFinite(seg[i]) && Number.isFinite(seg[i + 1]));
      assert.ok(seg[i + 1] >= -90 && seg[i + 1] <= 90, `赤纬 ${seg[i + 1]} 越界`);
    }
    segs += seg.length / 2 - 1;
  }
  assert.ok(segs > 500, `总线段数只有 ${segs}`);
});

test('星空表：88 个星座名，结构为 [中文名, 代码, 优先级, 连线坐标]', () => {
  const names = SKY.names;
  assert.ok(Array.isArray(names));
  assert.equal(names.length, 88, `只有 ${names.length} 个星座，应为 88`);

  for (const n of names) {
    assert.equal(n.length, 4, `${n[0]} 字段数 ${n.length}，应为 4`);
    const [cn, id, prio, coords] = n;
    assert.ok(/^[\u4e00-\u9fa5]{1,6}$/.test(cn), `「${cn}」不是纯中文名`);
    assert.ok(/^[A-Za-z]{2,3}$/.test(id), `星座代码「${id}」不合法`);
    assert.ok(Number.isInteger(prio) && prio >= 0, `${cn} 优先级 ${prio} 不合法`);
    // 名字的落点靠这条连线的坐标实时投影响重心，所以坐标必须完整
    assert.ok(Array.isArray(coords) && coords.length >= 4, `${cn} 缺少连线坐标`);
    assert.equal(coords.length % 2, 0, `${cn} 坐标个数应为偶数`);
    for (let i = 0; i < coords.length; i += 2) {
      assert.ok(coords[i + 1] >= -90 && coords[i + 1] <= 90, `${cn} 赤纬 ${coords[i + 1]} 越界`);
    }
  }

  // 几个必有的亮星座
  const set = new Set(names.map((n) => n[0]));
  for (const want of ['猎户座', '大熊座', '天蝎座', '天琴座', '仙后座', '南十字座', '仙女座']) {
    assert.ok(set.has(want), `缺少 ${want}`);
  }

  // 中文名与星座代码都应唯一（巨蛇座分两段，但只能有一个名字）
  assert.equal(new Set(names.map((n) => n[0])).size, 88, '星座中文名有重复');
  assert.equal(new Set(names.map((n) => n[1])).size, 88, '星座代码有重复');
});

test('星空表：星座名按优先级升序排列（决定谁先被显示）', () => {
  const prios = SKY.names.map((n) => n[2]);
  for (let i = 1; i < prios.length; i++) {
    assert.ok(prios[i] >= prios[i - 1], `第 ${i} 个优先级 ${prios[i]} 小于前一个 ${prios[i - 1]}`);
  }
  // 最高的几档应留给亮星座（猎户、大熊这类）
  assert.ok(prios[0] === 0, `最高优先级是 ${prios[0]}，应从 0 开始`);
  assert.ok(SKY.names[0][0] === '大熊座' || SKY.names[0][0] === '猎户座', `第一个应是最优先显示的亮星座，实为 ${SKY.names[0][0]}`);
});
