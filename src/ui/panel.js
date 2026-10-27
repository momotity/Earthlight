/**
 * ui/panel.js — 左侧控制面板：季节 / 日期 / 自转速度 / 星空开关
 */
import { doyToLabel, doyToSeason, activeSeasonDoy } from '../astronomy/format.js';
import { R2D } from '../lib/math.js';

export class ControlPanel {
  /**
   * @param {{onDoyChange:Function, onSpeedChange:Function, onReset:Function, onSkyToggle:Function}} handlers
   */
  constructor(handlers) {
    this.h = handlers;

    this.seasonName = document.getElementById('seasonName');
    this.dateOut = document.getElementById('dateOut');
    this.declOut = document.getElementById('declOut');
    this.slider = document.getElementById('daySlider');

    this.seasonBtns = [...document.querySelectorAll('.seasons button')];
    this.speedBtns = [...document.querySelectorAll('.speeds button')];
    this.viewBtns = [...document.querySelectorAll('.views button')];

    this.viewBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.markView(btn.dataset.view);
        this.h.onViewChange(btn.dataset.view);
      });
    });

    this.seasonBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.h.onDoyChange(parseInt(btn.dataset.seg, 10), { reframe: true });
      });
    });

    this.speedBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const spd = parseInt(btn.dataset.spd, 10);
        this.markSpeed(spd);
        this.h.onSpeedChange(spd);
      });
    });

    this.slider.addEventListener('input', () => {
      this.h.onDoyChange(parseInt(this.slider.value, 10), { reframe: true });
    });

    document.getElementById('resetBtn').addEventListener('click', () => this.h.onReset());

    const skyBtn = document.getElementById('skyToggle');
    this.skyOn = true;
    if (skyBtn) {
      skyBtn.addEventListener('click', () => {
        this.skyOn = !this.skyOn;
        skyBtn.classList.toggle('on', this.skyOn);
        skyBtn.textContent = this.skyOn ? '星座名称 · 开' : '星座名称 · 关';
        this.h.onSkyToggle(this.skyOn);
      });
    }
  }

  markSpeed(spd) {
    this.speedBtns.forEach((x) => x.classList.toggle('on', parseInt(x.dataset.spd, 10) === spd));
  }

  /** @param {'terminator'|'sun'} mode */
  markView(mode) {
    this.viewBtns.forEach((x) => x.classList.toggle('on', x.dataset.view === mode));
  }

  /** @param {{doy:number, declDeg:number}} s */
  sync(s) {
    this.slider.value = s.doy;
    this.dateOut.textContent = doyToLabel(s.doy);
    this.seasonName.textContent = doyToSeason(s.doy);
    this.declOut.textContent = `${s.declDeg >= 0 ? '+' : ''}${s.declDeg.toFixed(1)}°`;
    const seg = activeSeasonDoy(s.doy);
    this.seasonBtns.forEach((b) => b.classList.toggle('on', parseInt(b.dataset.seg, 10) === seg));
  }

  /** 从赤纬反推要显示的文字（面板只需要这个数字） */
  static declOf(astro) {
    return astro.decl * R2D;
  }
}
