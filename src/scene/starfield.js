/**
 * scene/starfield.js — 真实星表 + 星座连线
 *
 * 数据来自 d3-celestial（Yale 亮星星表子集，5044 颗 / 6 等以上）。
 *  - 恒星：按赤经赤纬摆到半径 SKY_RADIUS 的球壳上，按 B−V 色指数上色
 *  - 连线：星座内部星间连线，走球面大圆细分（直接连弦会切进球体里）
 *  - 名称：不在这里画，交给 ui/sky-labels.js 用 DOM 渲染，保证清晰可读
 */
import * as THREE from 'three';
import { SKY_RADIUS, STARFIELD } from '../config.js';
import { D2R, clamp, toXYZ, slerp } from '../lib/math.js';

/** B−V 色指数 → RGB（锚点取自几颗典型恒星，线性插值） */
const BV_STOPS = [
  [-0.40, 0.62, 0.72, 1.00],   // 蓝白 · 参宿七
  [0.00, 0.80, 0.87, 1.00],    // 青白 · 天狼
  [0.40, 0.97, 0.97, 1.00],    // 白   · 织女
  [0.80, 1.00, 0.92, 0.80],    // 黄白 · 南门二
  [1.30, 1.00, 0.82, 0.62],    // 橙   · 大角
  [2.00, 1.00, 0.72, 0.50]     // 红   · 参宿四
];

function bvColor(bv, out) {
  let i = 0;
  while (i < BV_STOPS.length - 2 && bv > BV_STOPS[i + 1][0]) i++;
  const a = BV_STOPS[i];
  const b = BV_STOPS[i + 1];
  const t = clamp((bv - a[0]) / (b[0] - a[0]), 0, 1);
  out[0] = a[1] + (b[1] - a[1]) * t;
  out[1] = a[2] + (b[2] - a[2]) * t;
  out[2] = a[3] + (b[3] - a[3]) * t;
}

const STAR_VERT = /* glsl */`
  attribute float aMag;
  attribute vec3 aCol;
  uniform float uPR;
  varying vec3 vCol;
  varying float vB;
  varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = normalize(wp.xyz);
    vCol = aCol;
    float sz = clamp(5.9 - aMag, 0.0, 7.4);
    gl_PointSize = (3.3 + sz * 1.85) * uPR;
    vB = clamp(1.06 - (aMag - 0.4) * 0.078, 0.70, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/** 太阳方向附近的星点淡出 —— 天亮了，星星自然看不见 */
const STAR_FRAG = /* glsl */`
  uniform vec3 uSunDir;
  varying vec3 vCol;
  varying float vB;
  varying vec3 vW;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.40, 0.04, r);
    float glow = smoothstep(0.50, 0.16, r) * 0.42;
    float a = clamp(core + glow, 0.0, 1.0);
    if (a < 0.02) discard;
    float sd = dot(normalize(vW), uSunDir);
    float vis = 1.0 - smoothstep(0.93, 0.9995, sd);
    gl_FragColor = vec4(vCol, a * vB * vis);
  }
`;

/**
 * @param {THREE.Scene} scene
 * @param {{stars:number[], lines:number[][], names:Array}} catalog
 * @param {number} pixelRatio
 */
export function createStarfield(scene, catalog, pixelRatio) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  scene.add(group);

  const sunDirUniform = { value: new THREE.Vector3(1, 0, 0) };

  // ---------- 恒星 ----------
  const s = catalog.stars;
  const count = Math.floor(s.length / 4);
  const positions = new Float32Array(count * 3);
  const mags = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const rgb = [1, 1, 1];
  const v = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    toXYZ(s[i * 4 + 1], s[i * 4], SKY_RADIUS, v);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
    mags[i] = s[i * 4 + 2];
    bvColor(s[i * 4 + 3], rgb);
    colors[i * 3] = rgb[0];
    colors[i * 3 + 1] = rgb[1];
    colors[i * 3 + 2] = rgb[2];
  }

  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute('aMag', new THREE.BufferAttribute(mags, 1));
  starGeo.setAttribute('aCol', new THREE.BufferAttribute(colors, 3));

  const starMat = new THREE.ShaderMaterial({
    uniforms: { uPR: { value: pixelRatio }, uSunDir: sunDirUniform },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending
  });

  const starPoints = new THREE.Points(starGeo, starMat);
  group.add(starPoints);

  // ---------- 星座连线 ----------
  const verts = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  for (const seg of catalog.lines) {
    for (let j = 0; j + 3 < seg.length; j += 2) {
      toXYZ(seg[j + 1], seg[j], SKY_RADIUS * 0.998, a).normalize();
      toXYZ(seg[j + 3], seg[j + 2], SKY_RADIUS * 0.998, b).normalize();

      const omega = Math.acos(clamp(a.dot(b), -1, 1));
      // 跨度越大分得越细，保证折线贴着天球（一段弧 ≈ 3°）
      const steps = clamp(Math.ceil(omega / (3 * D2R)), 1, STARFIELD.arcSegmentsMax);
      for (let k = 0; k < steps; k++) {
        slerp(a, b, k / steps, tmp).multiplyScalar(SKY_RADIUS * 0.998);
        verts.push(tmp.x, tmp.y, tmp.z);
        slerp(a, b, (k + 1) / steps, tmp).multiplyScalar(SKY_RADIUS * 0.998);
        verts.push(tmp.x, tmp.y, tmp.z);
      }
    }
  }

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: STARFIELD.lineColor,
    transparent: true,
    opacity: STARFIELD.lineOpacity,
    depthWrite: false,
    depthTest: true
  });
  const lineSegments = new THREE.LineSegments(lineGeo, lineMat);
  group.add(lineSegments);

  // ---------- 星座骨架星 ----------
  // 连线端点是「构成星座形状的那几颗星」。单独再画一组稍大的点，
  // 星座轮廓才立得起来 —— 否则只有细线，远看还是散的。
  const anchorKeys = new Set();
  const anchorVerts = [];
  for (const seg of catalog.lines) {
    for (let j = 0; j + 1 < seg.length; j += 2) {
      const key = `${Math.round(seg[j] * 10)}_${Math.round(seg[j + 1] * 10)}`;
      if (anchorKeys.has(key)) continue;
      anchorKeys.add(key);
      toXYZ(seg[j + 1], seg[j], SKY_RADIUS * 0.999, a);
      anchorVerts.push(a.x, a.y, a.z);
    }
  }
  const anchorGeo = new THREE.BufferGeometry();
  anchorGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(anchorVerts), 3));
  const anchorMat = new THREE.PointsMaterial({
    color: 0xe6efff,
    size: 3.1,
    sizeAttenuation: true,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending
  });
  const anchorPoints = new THREE.Points(anchorGeo, anchorMat);
  group.add(anchorPoints);

  return {
    group,
    starPoints,
    lineSegments,
    anchorPoints,
    /** 转给「星座名 DOM 标签」用的锚点列表：[{ra, dec, name, abbr}] */
    names: catalog.names || [],
    setRotationY(rad) {
      group.rotation.y = rad;
    },
    setSunDirection(dirWorld) {
      sunDirUniform.value.copy(dirWorld);
    },
    setLinesVisible(on) {
      lineSegments.visible = on;
      anchorPoints.visible = on;
    }
  };
}
