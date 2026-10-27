/**
 * astronomy/solar.js — 太阳位置（NOAA 简化算法）
 *
 * 输入只需两样：一年中的第几天（doy）和 UTC 小时。
 * 输出太阳赤纬、时差（equation of time）、直射点经度。
 *
 * 精度约 ±0.5°（赤纬）/ ±1 min（时差），远好于画面上一个像素的要求。
 */
import { D2R, R2D, clamp, normLon } from '../lib/math.js';

/**
 * @param {number} doy    一年中的第几天，1 = 1 月 1 日
 * @param {number} utcH   UTC 小时（0–24，可含小数）
 */
export function solarPosition(doy, utcH) {
  const g = (2 * Math.PI) / 365.2422 * (doy - 1 + (utcH - 12) / 24);

  // 赤纬 δ（弧度）
  const decl = 0.006918
    - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.001480 * Math.sin(3 * g);

  // 时差 EoT（分钟）
  const eot = 229.18 * (
    0.000075
    + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g)
  );

  // 直射点经度（度），东经为正
  const subLon = normLon(15 * (12 - utcH - eot / 60));

  return { decl, eot, subLon, g };
}

/**
 * 太阳在世界坐标里的方向（单位向量）。
 * 只有赤纬在动：+X 方向抬高 δ，绕 −Z 方向不转 —— 因为地球自己在转，
 * 「太阳绕地球转」是观察者视角的错觉，世界坐标里太阳永远是固定方向。
 */
export function sunDirection(decl, out) {
  const c = Math.cos(decl);
  return out.set(c, Math.sin(decl), 0);
}

/** 某地某时的太阳高度角（弧度） */
export function altitude(latDeg, lonDeg, decl, subLon) {
  const H = (lonDeg - subLon) * D2R;         // 时角
  const p = latDeg * D2R;
  const s = Math.sin(p) * Math.sin(decl)
    + Math.cos(p) * Math.cos(decl) * Math.cos(H);
  return Math.asin(clamp(s, -1, 1));
}

/**
 * 日出日落与昼长
 * @returns {{riseH:number|null, setH:number|null, dayLen:number, polar:string|null}}
 *          riseH/setH 是「真太阳时」框架下的小时数（0–24），调用方自行加减时区
 */
export function daylight(latDeg, decl, lonDeg, eot, tz) {
  const cosH0 = -Math.tan(latDeg * D2R) * Math.tan(decl);
  if (cosH0 >= 1) return { riseH: null, setH: null, dayLen: 0, polar: '极夜' };
  if (cosH0 <= -1) return { riseH: null, setH: null, dayLen: 24, polar: '极昼' };

  const H0 = Math.acos(cosH0) * R2D;
  const shift = lonDeg / 15 + eot / 60 - tz;
  return {
    riseH: 12 - H0 / 15 - shift,
    setH: 12 + H0 / 15 - shift,
    dayLen: (H0 / 15) * 2,
    polar: null
  };
}

/** 太阳高度的相位描述：白昼 / 黑夜 / 日出中 / 日落中 */
export function daylightPhase(altDeg, subLon, lonDeg) {
  const isDay = altDeg > -0.833;
  const golden = Math.abs(altDeg + 0.833) < 3.2;
  const hourAngle = normLon(lonDeg - subLon);
  if (golden) return { key: 'tw', text: hourAngle < 0 ? '日出中' : '日落中' };
  return isDay ? { key: 'day', text: '白昼' } : { key: 'night', text: '黑夜' };
}
