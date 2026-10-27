/**
 * ui/golden-list.js — 「此刻正在日出 / 日落」的城市列表
 *
 * 按太阳高度离 −0.833°（地平线）的远近排序，取最接近的一批。
 */
import { altitudeOf } from '../astronomy/city-state.js';
import { hhmm, toLocalHour } from '../astronomy/format.js';

export class GoldenList {
  /**
   * @param {Array} cities
   * @param {{onPick:Function}} handlers
   */
  constructor(cities, handlers) {
    this.cities = cities;
    this.h = handlers;
    this.el = document.getElementById('goldenList');
    this.title = document.getElementById('gTitle');
    this.count = document.getElementById('gCount');
    this._lastHtml = '';

    this.el.addEventListener('click', (e) => {
      const row = e.target.closest ? e.target.closest('.gi') : null;
      if (!row) return;
      this.h.onPick(parseInt(row.getAttribute('data-i'), 10));
    });
  }

  /** @param {number} utcHours @param {{decl:number, subLon:number}} sol */
  update(utcHours, sol) {
    const list = [];
    const cs = this.cities;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      const alt = altitudeOf(c[2], c[3], sol.decl, sol.subLon);
      const h = ((c[3] - sol.subLon + 540) % 360) - 180;
      list.push({ i, dist: Math.abs(alt + 0.833), alt, rising: h < 0 });
    }
    list.sort((p, q) => p.dist - q.dist);

    const band = list.filter((o) => o.dist < 3.0);
    const near = band.length === 0;
    const show = near ? list.slice(0, 6) : band.slice(0, 14);

    this.count.textContent = near ? '最近' : `${show.length} 座`;
    this.title.textContent = near ? '最接近晨昏线的城市' : '此刻正在日出 / 日落';

    let html = '';
    for (const o of show) {
      const c = cs[o.i];
      const tm = hhmm(toLocalHour(utcHours, c[5]));
      html += `<div class="gi" data-i="${o.i}" style="opacity:${near ? '0.6' : 1}">`
        + `<span class="dot ${o.rising ? 'up' : 'dn'}"></span>`
        + `<span class="nm">${c[0]}</span>`
        + `<span class="tm">${o.rising ? '日出 ' : '日落 '}${tm}</span>`
        + '</div>';
    }

    if (html !== this._lastHtml) {
      this.el.innerHTML = html;
      this._lastHtml = html;
    }
  }
}
