/**
 * ui/sun-marker.js — 画面外的太阳方位标记
 *
 * 晨昏线机位下，太阳必然在 90° 开外（这是几何，不是 bug），一定会出画。
 * 与其把太阳硬拉进画面，不如在画面边缘标出它的方向 —— 和天文馆软件的做法一致：
 * 光从哪来，一眼看得见，且没有篡改任何位置。
 */
import * as THREE from 'three';
import { SUN_DISTANCE } from '../config.js';

const _view = new THREE.Vector3();
const _proj = new THREE.Vector3();

export class SunMarker {
  /**
   * @param {HTMLElement} el
   * @param {{onClick?:Function}} opts
   */
  constructor(el, opts = {}) {
    this.el = el;
    this.onClick = opts.onClick || null;
    this.shown = false;
    if (this.el && this.onClick) {
      this.el.addEventListener('click', () => this.onClick());
    }
  }

  /**
   * @param {THREE.Vector3} sunDir 地心指向太阳的单位向量
   * @param {THREE.PerspectiveCamera} camera
   * @param {{l:number,r:number,t:number,b:number}} insets 面板安全区（px）
   */
  update(sunDir, camera, width, height, insets) {
    if (!this.el) return;
    const ins = insets || { l: 0, r: 0, t: 0, b: 0 };

    // 太阳已经落在安全区里 → 不需要标记
    _proj.copy(sunDir).multiplyScalar(SUN_DISTANCE).project(camera);
    const px = (_proj.x * 0.5 + 0.5) * width;
    const py = (-_proj.y * 0.5 + 0.5) * height;
    const inFrame = _proj.z < 1
      && px > ins.l + 26 && px < width - ins.r - 26
      && py > ins.t + 26 && py < height - ins.b - 26;

    if (inFrame) {
      if (this.shown) {
        this.el.style.opacity = '0';
        this.shown = false;
      }
      return;
    }

    // 视空间方向：z > 0 表示太阳在相机背后
    _view.copy(sunDir).transformDirection(camera.matrixWorldInverse);
    let dx = _view.x;
    let dy = -_view.y;          // 屏幕 y 向下
    if (_view.z > 0) {          // 背后：左右上下都反过来
      dx = -dx;
      dy = -dy;
    }
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    // 沿方向打到安全区边框上
    const cx = (ins.l + (width - ins.r)) / 2;
    const cy = (ins.t + (height - ins.b)) / 2;
    const ex = Math.max(40, (width - ins.r - ins.l) / 2 - 30);
    const ey = Math.max(40, (height - ins.b - ins.t) / 2 - 30);
    const k = Math.min(ex / (Math.abs(dx) || 1e-6), ey / (Math.abs(dy) || 1e-6));

    this.el.style.transform =
      `translate3d(${(cx + dx * k).toFixed(1)}px, ${(cy + dy * k).toFixed(1)}px, 0) translate(-50%, -50%)`;
    if (!this.shown) {
      this.el.style.opacity = '1';
      this.shown = true;
    }
  }
}
