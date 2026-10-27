/**
 * tests/geometry.test.js — 机位几何与「光影 vs 太阳」互斥关系
 *
 * 这一组测试守的是曾经翻过车的地方：为了让太阳进画面而把相机挪到夜半球，
 * 结果地球全黑。把几何关系写成断言，以后谁再动 VIEWS 都会立刻被拦住。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { earthAngularRadius, thetaForSunAngle } from '../src/scene/orbit.js';
import { VIEWS, CAMERA, SKY_RADIUS, SUN_DISTANCE } from '../src/config.js';
import { solarPosition } from '../src/astronomy/solar.js';
import { toXYZ, clamp, D2R, R2D } from '../src/lib/math.js';

const DEG = (v) => v * R2D;

/** 复算 orbit.js 里 apply() 的相机方向（单位向量），避免依赖 three 的相机 */
function cameraDir(theta, phi) {
  return [
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  ];
}

function angleBetween(a, b) {
  const d = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
  return Math.acos(d) * R2D;
}

test('earthAngularRadius 单调且落在合理区间', () => {
  assert.ok(Math.abs(earthAngularRadius(1.02) - 78.6) < 1, '贴脸时视半径应接近 79°');
  assert.ok(earthAngularRadius(3) > earthAngularRadius(6), '越远视角半径越小');
  assert.ok(earthAngularRadius(1000) < 0.1);
  // dist < 1（在地球内部）也不能返回 NaN
  assert.ok(Number.isFinite(earthAngularRadius(0.5)));
});

test('thetaForSunAngle 反解出的方位角真的能实现目标夹角 α', () => {
  // 覆盖全年的赤纬范围 × 多个俯仰 × 多个目标角
  const decls = [-23.44, -12, 0, 12, 23.44];
  const phis = [48, 60, 76.5, 90, 112];
  const alphas = [90, 96, 100, 130, 160];
  let checked = 0;

  for (const dDeg of decls) {
    for (const pDeg of phis) {
      for (const a of alphas) {
        const decl = dDeg * D2R;
        const phi = pDeg * D2R;
        const theta = thetaForSunAngle(a, phi, decl);

        const sun = [Math.cos(decl), Math.sin(decl), 0];
        const actual = angleBetween(cameraDir(theta, phi), sun);

        // cosα = sinφ·cosθ·cosδ + cosφ·sinδ，θ 自由时 cosθ ∈ [−1,1]
        // ⇒ cosα 的可达区间是 [sinδcosφ − |sinφ|cosδ, sinδcosφ + |sinφ|cosδ]
        const lo = Math.sin(decl) * Math.cos(phi) - Math.abs(Math.sin(phi)) * Math.cos(decl);
        const hi = Math.sin(decl) * Math.cos(phi) + Math.abs(Math.sin(phi)) * Math.cos(decl);
        const cosA = Math.cos(a * D2R);

        if (cosA >= lo - 1e-9 && cosA <= hi + 1e-9) {
          // 有解：必须精确命中
          assert.ok(Math.abs(actual - a) < 0.05,
            `δ=${dDeg}° φ=${pDeg}° 要 α=${a}°，实际 ${actual.toFixed(3)}°`);
          checked++;
        } else {
          // 无解：必须被夹到边界（θ = 0 或 π），而不是返回一个胡乱的角度
          const boundary = cosA > hi ? Math.acos(hi) * R2D : Math.acos(lo) * R2D;
          assert.ok(Math.abs(actual - boundary) < 0.05,
            `δ=${dDeg}° φ=${pDeg}° α=${a}° 不可达，应夹到边界 ${boundary.toFixed(2)}°，实际 ${actual.toFixed(3)}°`);
          assert.ok(theta === 0 || Math.abs(theta - Math.PI) < 1e-12, '不可达时应返回 0 或 π');
        }
      }
    }
  }
  assert.ok(checked > 60, `有效校验的样例只有 ${checked} 个，覆盖面不够`);
});

test('默认「晨昏线」机位：地球亮面约占 40%，太阳确实在画面外', () => {
  const alpha = VIEWS.terminator;
  // 亮面比例 (1+cosα)/2
  const lit = (1 + Math.cos(alpha * D2R)) / 2;
  assert.ok(lit > 0.35 && lit < 0.5, `亮面 ${(lit * 100).toFixed(1)}% 应落在 35%~50%`);

  // 太阳离画面中心的角距 = 180° − α，必须大于视场对角的一半
  const sunAngle = 180 - alpha;
  const halfDiagonal = Math.atan(
    Math.tan((CAMERA.fov / 2) * D2R) * Math.sqrt(1 + (16 / 9) ** 2)
  ) * R2D;
  assert.ok(sunAngle > halfDiagonal,
    `太阳距中心 ${sunAngle}° 应大于视场对角半径 ${halfDiagonal.toFixed(1)}°，否则它其实还在画面里`);
});

test('「太阳」机位：太阳进画面，代价是地球几乎全黑（几何事实）', () => {
  const dist = 3.75;
  const alpha = 180 - (earthAngularRadius(dist) + VIEWS.sunGap);
  const lit = (1 + Math.cos(alpha * D2R)) / 2;
  const sunAngle = 180 - alpha;

  assert.ok(sunAngle < CAMERA.fov / 2, `太阳距中心 ${sunAngle.toFixed(1)}° 应小于半视场 ${CAMERA.fov / 2}°`);
  assert.ok(lit < 0.15, `亮面只剩 ${(lit * 100).toFixed(1)}%，这就是「光影没了」的根源`);
  // 记录这条互斥关系：α 越大亮面越小
  assert.ok(alpha > VIEWS.terminator + 40, '太阳机位必须比晨昏线机位远离太阳 40° 以上');
});

test('两档机位的 α 覆盖了「有光影」与「见太阳」两端', () => {
  const distSum = 180 - (earthAngularRadius(CAMERA.maxDist) + VIEWS.sunGap);
  assert.ok(VIEWS.terminator >= 90 && VIEWS.terminator < 120);
  assert.ok(distSum > 150, '太阳机位的 α 应接近 180°');
});

test('星空球壳必须夹在相机 near/far 之间，且远大于地球', () => {
  assert.ok(SKY_RADIUS > 100, '太近会和星座连线抢深度');
  assert.ok(SKY_RADIUS + CAMERA.maxDist < CAMERA.far, '球壳不能被远端裁掉');
  assert.ok(SKY_RADIUS > SUN_DISTANCE * 4, '星空应在太阳之外，否则星空会切到太阳里面');
});

test('极轴朝向与星空组旋转一致：北极点绕 Y 轴旋转时不动', () => {
  const pole = toXYZ(90, 0, 1);
  const axis = new THREE.Vector3(0, 1, 0);
  for (const rotY of [0, 0.7, -2.1, Math.PI]) {
    const p = pole.clone().applyAxisAngle(axis, rotY);
    assert.ok(p.distanceTo(pole) < 1e-12, '绕 Y 轴旋转不应移动天极');
  }
});

test('太阳位置只随赤纬移动，与日期时刻无关的 XZ 分量', () => {
  for (const doy of [1, 79, 172, 266, 355]) {
    const s = solarPosition(doy, 12);
    const v = toXYZ(DEG(s.decl), 0, 1);
    // sunDirection 的约定：z 分量恒为 0（太阳永远在 +X 抬升 δ 的那个大圆上）
    assert.ok(Math.abs(v.z) < 1e-12, `doy=${doy} 太阳方向 z 应为 0`);
  }
});
