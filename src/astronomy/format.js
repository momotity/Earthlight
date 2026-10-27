/**
 * astronomy/format.js — 时间、经纬度、日期的人类可读格式
 */
import { pad2, clamp } from '../lib/math.js';

/** UTC 小时 + 时区偏移 → 当地小时（0–24） */
export function toLocalHour(utcHours, tz) {
  const h = utcHours + (tz == null ? 0 : tz);
  return ((h % 24) + 24) % 24;
}

export function tzLabel(tz) {
  if (tz == null) return 'UTC';
  const v = Math.abs(tz);
  const hh = Math.floor(v + 1e-6);
  const mm = Math.round((v - hh) * 60);
  return `UTC${tz >= 0 ? '+' : '-'}${hh}${mm ? ':' + pad2(mm) : ''}`;
}

/** 小时数（可越界）→ HH:MM */
export function hhmm(h) {
  const tot = Math.round((((h % 24) + 24) % 24) * 60);
  return `${pad2(Math.floor(tot / 60) % 24)}:${pad2(tot % 60)}`;
}

/** 小时数 → {hh, mm, ss}，用于卡片上的大号时钟（不进位到天） */
export function clockParts(hours) {
  const h = ((hours % 24) + 24) % 24;
  const hh = Math.floor(h);
  const m = (h - hh) * 60;
  const mm = Math.floor(m);
  const ss = Math.floor((m - mm) * 60);
  return { hh, mm, ss };
}

export function latStr(v) {
  return `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'N' : 'S'}`;
}

export function lonStr(v) {
  return `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'E' : 'W'}`;
}

export function dayLengthStr(dayLen) {
  let h = Math.floor(dayLen);
  let m = Math.round((dayLen - h) * 60);
  // 59.6 分钟会四舍五入成 60 —— 不进位就会显示成「9h60m」
  if (m === 60) { m = 0; h += 1; }
  return `${h}h${pad2(m)}m`;
}

/* ---------- 一年中的第几天 ---------- */

const DOY_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export function doyToLabel(doy) {
  let m = 0;
  for (let k = 11; k >= 0; k--) {
    if (doy > DOY_MONTH[k]) { m = k; break; }
  }
  return `${m + 1}月${doy - DOY_MONTH[m]}日`;
}

export function doyToSeason(doy) {
  if (doy >= 79 && doy < 172) return '春季';
  if (doy >= 172 && doy < 266) return '夏季';
  if (doy >= 266 && doy < 356) return '秋季';
  return '冬季';
}

/** 当前 doy 落在哪个节气档位（用于高亮季节按钮） */
export function activeSeasonDoy(doy) {
  if (doy >= 79 && doy < 172) return 79;
  if (doy >= 172 && doy < 266) return 172;
  if (doy >= 266 && doy < 356) return 266;
  return 356;
}

/** 北京时间的「今天」是这一年的第几天 */
export function doyFromDate(date, tzOffsetHours = 8) {
  const d = new Date(date.getTime() + tzOffsetHours * 3600000);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return clamp(Math.floor((d.getTime() - start) / 86400000) + 1, 1, 365);
}
