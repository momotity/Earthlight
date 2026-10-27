/**
 * lib/math.js — 通用数学工具
 * 所有角度相关函数默认使用「弧度」作为内部计算单位，只有明确带 Deg 后缀的才用度。
 */
import * as THREE from 'three';

export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
export const TAU = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 把角度归一到 (−π, π]，用于最短路径插值 */
export function normAng(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** 把角度归一到 [0, 360) —— 度版本 */
export function norm360(d) {
  return ((d % 360) + 360) % 360;
}

/** 把经度归一到 (−180, 180] */
export function normLon(d) {
  return norm360(d + 180) - 180;
}

/**
 * 赤道坐标 (RA/Dec，度) → 世界坐标
 *
 * 约定（与地球网格的 uv 对齐）：
 *   x =  r·cosφ·cosλ
 *   y =  r·sinφ
 *   z = −r·cosφ·sinλ
 * 即 λ=0 指向 +X，λ=90°E 指向 −Z。地球的 rotation.y = −直射经度 时，
 * 直射点正好落在 +X —— 也就是太阳所在方向。
 */
export function toXYZ(latDeg, lonDeg, radius = 1, out) {
  const p = latDeg * D2R;
  const l = lonDeg * D2R;
  const cp = Math.cos(p);
  const v = out || new THREE.Vector3();
  return v.set(radius * cp * Math.cos(l), radius * Math.sin(p), -radius * cp * Math.sin(l));
}

/**
 * 球面线性插值：在单位球面上沿大圆从 a 走到 b。
 * 星座连线若直接用弦（直线段），跨度大的时候会切进球体内部，
 * 视觉上会「陷进地球」或被裁剪，所以长弧一律走大圆细分。
 */
export function slerp(a, b, t, out) {
  const d = clamp(a.dot(b), -1, 1);
  const omega = Math.acos(d);
  const v = out || new THREE.Vector3();
  if (omega < 1e-5) return v.copy(a);
  const s = Math.sin(omega);
  return v.copy(a).multiplyScalar(Math.sin((1 - t) * omega) / s)
    .addScaledVector(b, Math.sin(t * omega) / s);
}

export function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}
