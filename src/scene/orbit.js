/**
 * scene/orbit.js — 轨道相机
 *
 * 球坐标 (theta 方位 / phi 极角 / dist 距离)，带阻尼与惯性。
 * 相机始终看向 (0, lookY, 0)，这样窄屏上地球可以整体上移给底部面板让位。
 */
import { D2R, clamp, lerp, normAng } from '../lib/math.js';

export class OrbitRig {
  /**
   * @param {HTMLElement} dom      事件源（canvas）
   * @param {THREE.PerspectiveCamera} camera
   * @param {{lookY?:number, onHover?:Function, onPick?:Function}} opts
   */
  constructor(dom, camera, opts = {}) {
    this.dom = dom;
    this.camera = camera;
    this.lookY = opts.lookY ?? 0;
    this.onHover = opts.onHover || null;
    this.onPick = opts.onPick || null;

    this.view = { theta: 0, phi: 0, dist: 3 };
    this.goal = { theta: 0, phi: 0, dist: 3 };
    this.vel = { theta: 0, phi: 0 };

    this.dragging = false;
    this.moved = 0;
    this._lastX = 0;
    this._lastY = 0;
    /** 选中城市后是否让镜头跟着地球自转 */
    this.follow = false;

    this._bind();
  }

  setPose(pose) {
    if (pose.theta != null) this.view.theta = this.goal.theta = pose.theta;
    if (pose.phi != null) this.view.phi = this.goal.phi = pose.phi;
    if (pose.dist != null) this.view.dist = this.goal.dist = pose.dist;
  }

  apply() {
    const sp = Math.sin(this.view.phi);
    this.camera.position.set(
      this.view.dist * sp * Math.cos(this.view.theta),
      this.view.dist * Math.cos(this.view.phi),
      this.view.dist * sp * Math.sin(this.view.theta)
    );
    this.camera.lookAt(0, this.lookY, 0);
  }

  _bind() {
    const dom = this.dom;

    dom.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.moved = 0;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this.follow = false;
      this.vel.theta = 0;
      this.vel.phi = 0;
      try { dom.setPointerCapture(e.pointerId); } catch (_) { /* 忽略 */ }
    });

    dom.addEventListener('pointermove', (e) => {
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      if (this.dragging) {
        this.moved += Math.abs(dx) + Math.abs(dy);
        this.goal.theta -= dx * 0.0055;
        this.goal.phi = clamp(this.goal.phi - dy * 0.0055, 0.16, Math.PI - 0.16);
        this.vel.theta = -dx * 0.0055;
        this.vel.phi = -dy * 0.0055;
        this._lastX = e.clientX;
        this._lastY = e.clientY;
      } else if (this.onHover) {
        this.onHover(e.clientX, e.clientY);
      }
    });

    const endDrag = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      try { dom.releasePointerCapture(e.pointerId); } catch (_) { /* 忽略 */ }
    };
    dom.addEventListener('pointerup', endDrag);
    dom.addEventListener('pointercancel', endDrag);
    dom.addEventListener('pointerleave', () => { if (this.onHover) this.onHover(-1, -1); });

    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.goal.dist = clamp(
        this.goal.dist * Math.exp(e.deltaY * 0.00085),
        1.45, 8.5
      );
    }, { passive: false });

    dom.addEventListener('click', () => {
      if (this.moved > 6) return;
      if (this.onPick) this.onPick();
    });
  }

  /**
   * 每帧推进
   * @param {number} dt 秒
   * @param {Function} [beforeUpdate] 阻尼前回调（用于「跟随城市」改写 goal.theta）
   */
  update(dt, beforeUpdate) {
    if (beforeUpdate) beforeUpdate();

    if (!this.dragging) {
      this.goal.theta += this.vel.theta;
      this.goal.phi = clamp(this.goal.phi + this.vel.phi, 0.16, Math.PI - 0.16);
      this.vel.theta *= 0.93;
      this.vel.phi *= 0.93;
      if (Math.abs(this.vel.theta) < 1e-5) this.vel.theta = 0;
      if (Math.abs(this.vel.phi) < 1e-5) this.vel.phi = 0;
    }

    const kT = 1 - Math.pow(0.0001, dt);
    this.view.theta = normAng(this.view.theta + normAng(this.goal.theta - this.view.theta) * kT);
    this.view.phi = lerp(this.view.phi, this.goal.phi, kT);
    this.view.dist = lerp(this.view.dist, this.goal.dist, 1 - Math.pow(0.0008, dt));
    this.apply();
  }

  /** 把镜头缓慢转到某个世界方位（弧度），用于「选中城市后看向它」 */
  rotateTowards(theta, factor = 0.06) {
    const d = normAng(theta - this.goal.theta);
    if (Math.abs(d) * (180 / Math.PI) < 0.4) return;
    this.goal.theta = normAng(this.goal.theta + d * factor);
  }
}

/**
 * 地球在相机里的视半径（度）
 * @param {number} dist 相机到地心距离（以地球半径为 1）
 */
export function earthAngularRadius(dist) {
  return Math.asin(Math.min(1, 1 / Math.max(dist, 1.02))) * (180 / Math.PI);
}

/**
 * 求「相机与太阳夹角 = α」时相机的世界方位角 θ
 *
 * 太阳方向 s = (cosδ, sinδ, 0)，相机方向 c = (sinφcosθ, cosφ, sinφsinθ)，
 * 于是 cosα = sinφ·cosθ·cosδ + cosφ·sinδ，反解 θ 即可。
 * 无解时（φ 太贴近黄道、怎么也够不到 α）夹到边界 —— 也就是「这个俯仰下能离太阳最近的位置」。
 *
 * @param {number} alphaDeg 期望的 α（度）：90 = 晨昏线正对相机，180 = 正对夜半球
 * @param {number} phi      极角（弧度）
 * @param {number} declRad  太阳赤纬（弧度）
 */
export function thetaForSunAngle(alphaDeg, phi, declRad) {
  const cosA = Math.cos(alphaDeg * D2R);
  const den = Math.sin(phi) * Math.cos(declRad);
  if (Math.abs(den) < 1e-6) return Math.PI;
  const cosT = (cosA - Math.cos(phi) * Math.sin(declRad)) / den;
  return Math.acos(Math.max(-1, Math.min(1, cosT)));
}

