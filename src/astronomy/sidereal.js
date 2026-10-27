/**
 * astronomy/sidereal.js — 恒星时与星空朝向
 *
 * 星空不是背景图，是按真实赤经赤纬摆好的球壳，随时间整体绕天极旋转。
 * 关键量是格林尼治平恒星时（GMST），决定「此刻天上哪一片在头顶」。
 */
import { D2R, norm360 } from '../lib/math.js';

/**
 * 格林尼治平恒星时（度），输入 UTC 毫秒（IAU 1982 表达式）
 */
export function gmstDeg(ms) {
  const jd = ms / 86400000 + 2440587.5;
  const d = jd - 2451545.0;
  const T = d / 36525;
  const g = 280.46061837
    + 360.98564736629 * d
    + 0.000387933 * T * T
    - (T * T * T) / 38710000;
  return norm360(g);
}

/**
 * 星空组的 rotation.y（弧度）
 *
 * 推导：星点按 α 摆在 (cosδcosα, sinδ, −cosδsinα)，绕 Y 轴转 θ 后方位角为 α − θ。
 * 我们要让方位角 = α − (GMST + 直射经度)，因为世界里 +X 是太阳方向，
 * 而太阳赤经 α☉ = GMST + 直射经度（直射经度是东经为正，GMST 是其赤经基准）。
 * 于是 θ = −(GMST + subLon)。
 *
 * 这样无论拖季节滑块（改 doy → 改 GMST → 换季星空）还是推进时间，
 * 星星都自动落在正确的方位，和地球的晨昏线严格对应。
 */
export function skyRotationY(ms, subLon) {
  return -norm360(gmstDeg(ms) + subLon) * D2R;
}

/** 由「一年中的第几天 + UTC 小时」拼出一个用于恒星时计算的 UTC 毫秒 */
export function skyTimestamp(year, doy, utcHours) {
  return Date.UTC(year, 0, 1) + (doy - 1) * 86400000 + utcHours * 3600000;
}
