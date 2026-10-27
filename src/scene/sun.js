/**
 * scene/sun.js — 太阳
 *
 * 太阳不在画面上做任何「补偿」：它在世界坐标里的方位就是真实方位。
 * 看不到太阳 = 它被地球挡住或者在你背后，这本身就是正确的物理。
 * 想看到它，就转到晨昏线那一侧去（初始机位就是这么定的，见 main.js）。
 */
import * as THREE from 'three';
import { SUN_DISTANCE, SUN_SCALE } from '../config.js';

/** 程序化生成太阳光晕：核心 + 暖色外晕，避免额外贴图请求 */
function sunTexture() {
  const s = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  rg.addColorStop(0.00, 'rgba(255,255,255,1)');
  rg.addColorStop(0.30, 'rgba(255,254,248,1)');
  rg.addColorStop(0.36, 'rgba(255,244,214,0.95)');
  rg.addColorStop(0.50, 'rgba(255,206,128,0.32)');
  rg.addColorStop(0.72, 'rgba(255,164,74,0.09)');
  rg.addColorStop(1.00, 'rgba(255,140,50,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.Texture(cv);
  tex.needsUpdate = true;
  return tex;
}

export function createSun(scene) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    opacity: 0.95
  }));
  sprite.scale.set(SUN_SCALE, SUN_SCALE, 1);
  sprite.position.set(SUN_DISTANCE, 0, 0);
  scene.add(sprite);

  return {
    sprite,
    /** 太阳方向为单位向量，位置 = 方向 × 距离 */
    update(dirWorld) {
      sprite.position.copy(dirWorld).multiplyScalar(SUN_DISTANCE);
    }
  };
}
