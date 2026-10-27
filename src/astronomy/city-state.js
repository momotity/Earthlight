/**
 * astronomy/city-state.js — 把「某城市 + 某时刻」算成一屏可显示的数据
 * UI 层只负责把这些数字摆到 DOM 上，坐标里不含任何渲染逻辑。
 */
import { D2R, R2D } from '../lib/math.js';
import { solarPosition, altitude, daylight, daylightPhase } from './solar.js';
import { toLocalHour } from './format.js';

/**
 * @param {[string,string,number,number,number,number]} city [名称, 省份, 纬度, 经度, 人口, 时区]
 * @param {Date} simTime
 * @param {number} doy
 */
export function cityState(city, simTime, doy) {
  const [, , lat, lon, , tz] = city;
  const utcH = simTime.getUTCHours()
    + simTime.getUTCMinutes() / 60
    + simTime.getUTCSeconds() / 3600
    + simTime.getUTCMilliseconds() / 3.6e6;

  const sol = solarPosition(doy, utcH);
  const altDeg = altitude(lat, lon, sol.decl, sol.subLon) * R2D;
  const phase = daylightPhase(altDeg, sol.subLon, lon);
  const day = daylight(lat, sol.decl, lon, sol.eot, tz);

  return {
    utcHours: utcH,
    localHours: toLocalHour(utcH, tz),
    trueSolarHours: utcH + lon / 15 + sol.eot / 60,
    altDeg,
    phase,
    riseHours: day.riseH,
    setHours: day.setH,
    dayLength: day.dayLen,
    polar: day.polar,
    subsolarLat: sol.decl * R2D,
    subsolarLon: sol.subLon,
    tz
  };
}

/** 任意地点任意时刻的太阳高度（度），晨昏线城市列表用 */
export function altitudeOf(lat, lon, decl, subLon) {
  return altitude(lat, lon, decl, subLon) * R2D;
}

export { D2R };
