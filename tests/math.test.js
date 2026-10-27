/**
 * tests/math.test.js — 坐标约定与角度归一的回归测试
 *
 * 这些函数是全项目的「单位制」：一旦写错，画面上所有东西都会整体镜像或错位，
 * 而肉眼很难一眼看出来，所以值得逐条钉死。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  D2R, R2D, clamp, lerp, normAng, norm360, normLon, toXYZ, slerp, pad2
} from '../src/lib/math.js';

test('D2R / R2D 互为逆运算', () => {
  assert.ok(Math.abs(90 * D2R * R2D - 90) < 1e-12);
});

test('clamp 只在越界时生效', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.5, 0, 1), 0.5);
});

test('lerp 端点严格闭合', () => {
  assert.equal(lerp(3, 7, 0), 3);
  assert.equal(lerp(3, 7, 1), 7);
  assert.equal(lerp(3, 7, 0.5), 5);
});

test('norm360 把任意角归一到 [0, 360)', () => {
  for (const [input, want] of [[0, 0], [360, 0], [-1, 359], [721, 1], [-370, 350]]) {
    const got = norm360(input);
    assert.ok(Math.abs(got - want) < 1e-9, `${input} → ${got}，期望 ${want}`);
    assert.ok(got >= 0 && got < 360, `${got} 越界`);
  }
});

test('normLon 输出落在 (−180, 180]', () => {
  assert.ok(Math.abs(normLon(0) - 0) < 1e-9);
  assert.ok(Math.abs(normLon(190) - -170) < 1e-9);
  assert.ok(Math.abs(normLon(-190) - 170) < 1e-9);
  for (let d = -720; d <= 720; d += 7) {
    const v = normLon(d);
    assert.ok(v > -180 - 1e-9 && v <= 180 + 1e-9, `normLon(${d}) = ${v}`);
  }
});

test('normAng 取最短路径（与原角相差 2π 整数倍，且落在 [−π, π]）', () => {
  const cases = [0, 0.5, Math.PI - 1e-6, -Math.PI + 1e-6, 3 * Math.PI, -7.5, 100];
  for (const a of cases) {
    const r = normAng(a);
    assert.ok(r >= -Math.PI - 1e-9 && r <= Math.PI + 1e-9, `normAng(${a}) = ${r} 越界`);
    assert.ok(Math.abs(Math.cos(r) - Math.cos(a)) < 1e-9, `normAng(${a}) 方向错了`);
    assert.ok(Math.abs(Math.sin(r) - Math.sin(a)) < 1e-9, `normAng(${a}) 方向错了`);
  }
});

test('toXYZ 的坐标约定：经度 0 → +X，90°E → −Z，北极 → +Y', () => {
  const p = new THREE.Vector3();

  toXYZ(0, 0, 1, p);
  assert.ok(p.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-12, '本初子午线应指向 +X');

  toXYZ(0, 90, 1, p);
  assert.ok(p.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-12, '90°E 应指向 −Z');

  toXYZ(90, 0, 1, p);
  assert.ok(p.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-12, '北极应指向 +Y');

  // 半径参数必须真的生效
  toXYZ(45, 30, 3, p);
  assert.ok(Math.abs(p.length() - 3) < 1e-12);
});

test('toXYZ 与地球自转自洽：rotation.y = −经度 后，该经度落在 +X', () => {
  const p = new THREE.Vector3();
  for (const lon of [-180, -90, -12.5, 0, 33, 116.4, 180]) {
    toXYZ(0, lon, 1, p);
    p.applyAxisAngle(new THREE.Vector3(0, 1, 0), -lon * D2R);
    // 浮点累积误差随角度变大，给 1e-9 足够
    assert.ok(Math.abs(p.x - 1) < 1e-9 && Math.abs(p.z) < 1e-9,
      `经度 ${lon} 旋转后没落回 +X：${p.toArray()}`);
  }
});

test('slerp 中点落在两点连线的大圆上，且长度为 1', () => {
  const a = toXYZ(0, 0, 1);
  const b = toXYZ(0, 90, 1);
  const mid = slerp(a, b, 0.5);
  assert.ok(Math.abs(mid.length() - 1) < 1e-12, '大圆插值结果必须仍是单位向量');

  const naive = a.clone().add(b).normalize();   // 90° 夹角的弦中点方向 == 大圆中点
  assert.ok(mid.distanceTo(naive) < 1e-12, '90° 时大圆中点应与弦方向一致');
});

test('slerp 端点与退化输入', () => {
  const a = toXYZ(20, 30, 1);
  const b = toXYZ(-40, 150, 1);
  assert.ok(slerp(a, b, 0).distanceTo(a) < 1e-12);
  assert.ok(slerp(a, b, 1).distanceTo(b) < 1e-12);
  assert.ok(slerp(a, a, 0.5).distanceTo(a) < 1e-12, '重合点不应产生 NaN');
});

test('pad2 补零', () => {
  assert.equal(pad2(0), '00');
  assert.equal(pad2(9), '09');
  assert.equal(pad2(10), '10');
});
