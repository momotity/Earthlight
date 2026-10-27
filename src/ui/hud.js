/**
 * ui/hud.js — 悬停提示气泡 / 城市名浮标 / 底部时钟条
 */
import { pad2 } from '../lib/math.js';
import { hhmm, toLocalHour, tzLabel } from '../astronomy/format.js';
import { latStr, lonStr } from '../astronomy/format.js';

export class Hud {
  constructor() {
    this.tip = document.getElementById('tip');
    this.pin = document.getElementById('pin');
    this.pinText = this.pin.querySelector('.t');
    this.utcClock = document.getElementById('utcClock');
    this.cstClock = document.getElementById('cstClock');
    this.subsolar = document.getElementById('subsolar');
  }

  /** 悬停某城市时的气泡；传 −1 关闭 */
  hover(city, pos, utcHours) {
    if (!city || !pos) { this.hideTip(); return; }
    this.tip.innerHTML = `<b>${city[0]}</b><i>${hhmm(toLocalHour(utcHours, city[5]))}</i>`;
    this.tip.style.left = `${pos.x}px`;
    this.tip.style.top = `${pos.y}px`;
    this.tip.classList.add('on');
  }

  hideTip() {
    this.tip.classList.remove('on');
  }

  pinAt(name, pos) {
    if (!name || !pos) { this.pin.classList.remove('on'); return; }
    this.pinText.textContent = name;
    this.pin.style.left = `${pos.x}px`;
    this.pin.style.top = `${pos.y - 14}px`;
    this.pin.classList.add('on');
  }

  hidePin() {
    this.pin.classList.remove('on');
  }

  clock(date, sol) {
    const uh = date.getUTCHours();
    this.utcClock.textContent =
      `${pad2(uh)}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
    this.cstClock.textContent =
      `${pad2((uh + 8) % 24)}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
    this.subsolar.textContent =
      `${sol.subsolarLat >= 0 ? sol.subsolarLat.toFixed(1) + '°N' : (-sol.subsolarLat).toFixed(1) + '°S'}  ` +
      `${sol.subsolarLon >= 0 ? sol.subsolarLon.toFixed(1) + '°E' : (-sol.subsolarLon).toFixed(1) + '°W'}`;
  }

  static latLon(lat, lon) {
    return `${latStr(lat)} ${lonStr(lon)}`;
  }

  static tz(tz) {
    return tzLabel(tz);
  }
}
