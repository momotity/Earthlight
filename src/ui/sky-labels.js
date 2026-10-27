/**
 * ui/sky-labels.js — 星座名称（DOM 图层）
 *
 * 为什么不用 Sprite 画名字：
 *   Sprite 是贴图，字号随距离缩放、又被 WebGL 的抗锯齿和加法混合一起糊掉，
 *   小字根本看不清。DOM 覆盖层则是屏幕像素级清晰，还能做避让、命中、动效。
 *
 * 位置怎么定（这里踩过坑，写清楚）：
 *   一开始用「星座中心点」当锚点，结果同屏常常只显示出一两个名字 ——
 *   因为星座中心大多落在地球背面或屏幕外，而星座本身还在画面边缘露着头。
 *   现在改成：每帧把该星座所有星点投影一遍，只留下「没被地球挡住、且在屏幕内」
 *   的那些，取它们的屏幕重心作为名字位置。只要星座有任何一截露在画面里，
 *   名字就贴到那一截上 —— 这也是 Stellarium 一类软件的做法。
 */
import * as THREE from 'three';
import { SKY_LABELS, SKY_RADIUS } from '../config.js';
import { clamp, toXYZ } from '../lib/math.js';

const EARTH_R2 = 1.0;           // 地球半径平方，用于遮挡判断
const MIN_VISIBLE_RATIO = 0.15; // 星座至少露出这个比例的星点才标名
const MIN_VISIBLE_PTS = 2;

export class SkyLabels {
  /**
   * @param {HTMLElement} container 绝对定位的覆盖层
   * @param {{names:Array, radius?:number}} catalog
   * @param {THREE.Camera} camera
   * @param {{onSelect?:Function}} [opts]
   */
  constructor(container, catalog, camera, opts = {}) {
    this.container = container;
    this.camera = camera;
    this.radius = catalog.radius || SKY_RADIUS * 0.99;
    this.onSelect = opts.onSelect || null;
    this.enabled = true;

    this._w = new THREE.Vector3();
    this._items = [];
    this.lastStats = { total: 0, inScreen: 0, shown: 0 };

    for (const n of catalog.names) {
      const [cn, abbr, prio, flat] = n;

      // 预先把赤经赤纬转成球壳上的本地坐标，每帧只做矩阵变换
      const pts = [];
      for (let i = 0; i < flat.length; i += 2) {
        pts.push(toXYZ(flat[i + 1], flat[i], this.radius));
      }

      const el = document.createElement('button');
      el.className = 'sky-label';
      el.type = 'button';
      el.innerHTML = `<span class="cn">${cn}</span>`;
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      el.setAttribute('aria-label', `星座 ${cn}`);
      this.container.appendChild(el);

      const item = {
        el, pts, name: cn, abbr, priority: prio,
        visible: false,
        x: 0, y: 0,
        smoothX: 0, smoothY: 0,   // 平滑位置：星点进出画面时名字不会乱跳
        score: 1
      };

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onSelect) this.onSelect(item);
      });

      this._items.push(item);
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      for (const it of this._items) {
        it.el.style.opacity = '0';
        it.el.style.pointerEvents = 'none';
        it.visible = false;
      }
    }
  }

  /**
   * @param {THREE.Matrix4} groupMatrix 星空组的世界矩阵
   * @param {THREE.Vector3} cameraPos  相机世界位置
   * @param {number} width  视口宽（px）
   * @param {number} height 视口高（px）
   * @param {{l:number,r:number,t:number,b:number}} [insets] 面板占用的安全区（px）
   */
  update(groupMatrix, cameraPos, width, height, insets) {
    if (!this.enabled || !this._items.length) return;

    const camX = cameraPos.x;
    const camY = cameraPos.y;
    const camZ = cameraPos.z;
    const camDist = cameraPos.length();
    const w = this._w;
    const cand = [];

    // 手机屏太窄，可放的天空本来就不多：放低门槛、收紧间距，宁可小而少也要有
    const compact = width < 700;
    const minRatio = compact ? 0.03 : MIN_VISIBLE_RATIO;
    const gapPx = compact ? 34 : SKY_LABELS.minGap;
    const maxN = compact ? 5 : SKY_LABELS.maxLabels;

    // 面板会盖住画面四边，名字落到面板底下就等于白写 —— 先划出可用的「安全区」
    const ins = insets || { l: 0, r: 0, t: 0, b: 0 };
    const minX = ins.l + 6;
    const maxX = width - ins.r - 6;
    const minY = ins.t + 6;
    const maxY = height - ins.b - 6;

    // 相机离地球越近，画面越「满」，名字权重略高
    const facing = clamp(1 - (camDist - 1) / 8, 0.3, 1);

    for (const item of this._items) {
      const pts = item.pts;
      let sumX = 0;
      let sumY = 0;
      let seen = 0;
      let front = 0;

      for (let i = 0; i < pts.length; i++) {
        w.copy(pts[i]).applyMatrix4(groupMatrix);

        // 相机 → 星点的连线是否穿过地球
        const vx = w.x - camX;
        const vy = w.y - camY;
        const vz = w.z - camZ;
        const vv = vx * vx + vy * vy + vz * vz;
        const t = -(camX * vx + camY * vy + camZ * vz) / vv;
        if (t > 0 && t < 1) {
          const cx = camX + vx * t;
          const cy = camY + vy * t;
          const cz = camZ + vz * t;
          if (cx * cx + cy * cy + cz * cz < EARTH_R2) continue;   // 被地球挡住
        }

        const p = w.project(this.camera);   // 就地投影，w 变为 NDC
        if (p.z > 1 || p.z < -1) continue;
        front++;

        const sx = (p.x * 0.5 + 0.5) * width;
        const sy = (-p.y * 0.5 + 0.5) * height;
        if (sx < minX || sx > maxX || sy < minY || sy > maxY) continue;

        sumX += sx;
        sumY += sy;
        seen++;
      }

      const ratio = front === 0 ? 0 : seen / front;
      if (seen < MIN_VISIBLE_PTS || ratio < minRatio) {
        if (item.visible) {
          item.el.style.opacity = '0';
          item.el.style.pointerEvents = 'none';
          item.visible = false;
        }
        continue;
      }

      const tx = sumX / seen;
      const ty = sumY / seen;

      if (!item.visible) {
        item.smoothX = tx;    // 首次出现直接落位，避免从 (0,0) 飘过来
        item.smoothY = ty;
      } else {
        item.smoothX += (tx - item.smoothX) * 0.3;
        item.smoothY += (ty - item.smoothY) * 0.3;
      }
      item.x = item.smoothX;
      item.y = item.smoothY;

      const dx = (item.x - width / 2) / (width / 2);
      const dy = (item.y - height / 2) / (height / 2);
      const edge = Math.max(Math.abs(dx), Math.abs(dy));
      const fame = (60 - item.priority) * 0.008;
      item.score = (1 - edge * 0.62) * facing
        * (0.55 + 0.45 * Math.min(1, ratio * 2)) + fame;

      cand.push(item);
    }

    cand.sort((a, b) => b.score - a.score);

    const placed = [];
    const gap2 = gapPx * gapPx;
    let shown = 0;

    for (const item of cand) {
      let ok = shown < maxN;
      if (ok) {
        for (const other of placed) {
          const ddx = item.x - other.x;
          const ddy = item.y - other.y;
          if (ddx * ddx + ddy * ddy < gap2) { ok = false; break; }
        }
      }
      if (!ok) {
        if (item.visible) {
          item.el.style.opacity = '0';
          item.el.style.pointerEvents = 'none';
          item.visible = false;
        }
        continue;
      }

      placed.push(item);
      shown++;

      const alpha = clamp(0.68 + item.score * 0.32, 0, 1);
      item.el.style.transform =
        `translate3d(${item.x.toFixed(1)}px, ${item.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      item.el.style.opacity = alpha.toFixed(2);
      item.el.style.pointerEvents = 'auto';
      item.visible = true;
    }

    this.lastStats = {
      total: this._items.length,
      inScreen: cand.length,
      shown
    };
  }
}
