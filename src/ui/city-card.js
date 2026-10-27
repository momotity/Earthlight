/**
 * ui/city-card.js — 右侧城市卡片：当地时间 / 真太阳时 / 日出日落弧 / 关键指标
 */
import {
  hhmm, clockParts, tzLabel, latStr, lonStr, dayLengthStr
} from '../astronomy/format.js';
import { clamp } from '../lib/math.js';

const ARC_W = 240;
const ARC_H = 56;

export class CityCard {
  constructor() {
    this.el = {
      name: document.getElementById('cName'),
      prov: document.getElementById('cProv'),
      badge: document.getElementById('cBadge'),
      time: document.getElementById('cTime'),
      sub: document.getElementById('cSub'),
      arc: document.getElementById('cArc'),
      alt: document.getElementById('mAlt'),
      day: document.getElementById('mDay'),
      rise: document.getElementById('mRise'),
      set: document.getElementById('mSet')
    };
  }

  /** @param {object} city  @param {object} st cityState() 的返回值 */
  render(city, st) {
    const { name, prov, lat, lon } = {
      name: city[0],
      prov: city[1],
      lat: city[2],
      lon: city[3]
    };

    this.el.name.textContent = name;
    this.el.prov.textContent = `${prov} · ${latStr(lat)} ${lonStr(lon)}`;

    const t = clockParts(st.localHours);
    this.el.time.innerHTML =
      `${t.hh < 10 ? '0' : ''}${t.hh}:${t.mm < 10 ? '0' : ''}${t.mm}` +
      `<small>:${t.ss < 10 ? '0' : ''}${t.ss}</small>`;

    this.el.sub.textContent =
      `${tzLabel(st.tz)} 当地时间 · 真太阳时 ${hhmm(st.trueSolarHours)}`;

    this.el.badge.className = `badge ${st.phase.key}`;
    this.el.badge.textContent = st.phase.text;
    this.el.badge.style.visibility = 'visible';

    this.el.alt.textContent = `${st.altDeg >= 0 ? '+' : ''}${st.altDeg.toFixed(1)}°`;
    this.el.day.textContent = st.polar || dayLengthStr(st.dayLength);
    this.el.rise.textContent = st.riseHours == null ? '—' : hhmm(st.riseHours);
    this.el.set.textContent = st.setHours == null ? '—' : hhmm(st.setHours);

    this.el.arc.innerHTML = arcSvg(st);
  }
}

/** 日出日落弧：太阳沿贝塞尔弧从东走到西 */
function arcSvg(st) {
  const isDay = st.altDeg > -0.833;

  let t = 0.5;
  if (st.riseHours != null && st.setHours != null) {
    let span = st.setHours - st.riseHours;
    if (span < 0) span += 24;
    let cur = st.localHours - st.riseHours;
    if (cur < 0) cur += 24;
    t = clamp(cur / span, 0, 1);
  } else {
    t = isDay ? 0.5 : 0.02;
  }

  const bz = (p0, p1, p2, u) => (1 - u) * (1 - u) * p0 + 2 * (1 - u) * u * p1 + u * u * p2;
  const sx = bz(6, 40, 234, t);
  const sy = bz(48, 4, 48, t);
  const col = isDay ? '#ffb257' : '#6f9bff';
  const glow = isDay ? 'rgba(255,178,87,.55)' : 'rgba(111,155,255,.4)';
  const path = 'M6,48 C 40,4 200,4 234,48';

  return `<svg viewBox="0 0 ${ARC_W} ${ARC_H}" preserveAspectRatio="none">
    <defs>
      <linearGradient id="ag" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="rgba(120,170,255,.05)"/>
        <stop offset=".5" stop-color="rgba(255,210,150,.22)"/>
        <stop offset="1" stop-color="rgba(120,170,255,.05)"/>
      </linearGradient>
    </defs>
    <path d="${path}" fill="none" stroke="url(#ag)" stroke-width="1.4" stroke-dasharray="3 3"/>
    <line x1="6" y1="48" x2="234" y2="48" stroke="rgba(120,160,255,.16)" stroke-width="1"/>
    <path d="${path}" fill="none" stroke="${col}" stroke-width="1.6" opacity=".28"
          stroke-dasharray="${(t * 240).toFixed(1)} 999"/>
    <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="9" fill="${glow}" opacity=".35"/>
    <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3.6" fill="${col}"/>
    <circle cx="6" cy="48" r="1.8" fill="rgba(140,180,255,.6)"/>
    <circle cx="234" cy="48" r="1.8" fill="rgba(140,180,255,.6)"/>
  </svg>`;
}
