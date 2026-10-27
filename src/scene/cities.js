/**
 * scene/cities.js — 城市点云 / 悬停拾取 / 选中标记
 *
 * 点云挂在 earth 下面，随地球一起转；拾取用 Raycaster 打点，
 * 再用「该点是否朝向相机」二次过滤 —— 否则会打到地球背面的点。
 */
import * as THREE from 'three';
import { EARTH_RADIUS } from '../config.js';
import { toXYZ } from '../lib/math.js';

const CITY_VERT = /* glsl */`
  attribute float aSize;
  uniform vec3 sunDir;
  uniform float uPR;
  varying vec3 vCol;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 N = normalize(mat3(modelMatrix) * normalize(position));
    vec3 V = normalize(cameraPosition - wp.xyz);
    float facing = dot(N, V);
    float ndl = dot(N, sunDir);
    float isDay = smoothstep(-0.05, 0.16, ndl);
    // 夜面城市亮青色，昼面偏暖白
    vCol = mix(vec3(0.40, 1.0, 0.90), vec3(1.0, 0.97, 0.88), isDay);
    gl_PointSize = aSize * uPR * 1.1;
    gl_Position = projectionMatrix * viewMatrix * wp;
    if (facing < 0.055) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); }
  }
`;

const CITY_FRAG = /* glsl */`
  varying vec3 vCol;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    float core = smoothstep(0.34, 0.08, r);
    float ring = smoothstep(0.50, 0.26, r) * 0.55;
    vec3 col = mix(vCol * 0.10, vCol, core);
    float a = clamp(core + ring * 0.5, 0.0, 1.0);
    gl_FragColor = vec4(col, a);
  }
`;

/** 选中标记：十字准星圆环 */
function markerTexture() {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const c = s / 2;
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 4;
  g.beginPath(); g.arc(c, c, s * 0.30, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(120,200,255,0.55)';
  g.lineWidth = 2;
  g.beginPath(); g.arc(c, c, s * 0.42, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,255,255,1)';
  g.beginPath(); g.arc(c, c, 3.5, 0, Math.PI * 2); g.fill();
  const t = new THREE.Texture(cv);
  t.needsUpdate = true;
  return t;
}

export function createCityLayer(earth, cities, { pixelRatio = 1, sunDir }) {
  const N = cities.length;
  const positions = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  const surface = EARTH_RADIUS * 1.012;

  for (let i = 0; i < N; i++) {
    const c = cities[i];
    const v = toXYZ(c[2], c[3], surface);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
    const pop = c[4] || 0;
    sizes[i] = pop > 4000000 ? 7.6 : pop > 1500000 ? 6.4 : 5.4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: sunDir },
      uPR: { value: pixelRatio }
    },
    vertexShader: CITY_VERT,
    fragmentShader: CITY_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true
  });

  const points = new THREE.Points(geo, mat);
  points.renderOrder = 2;
  earth.add(points);

  // ---------- 选中标记 ----------
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({
    map: markerTexture(),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    opacity: 1
  }));
  marker.scale.set(0.09, 0.09, 1);
  marker.visible = false;
  earth.add(marker);

  // ---------- 拾取 ----------
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.045;
  const ndc = new THREE.Vector2();
  const tmpWorld = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();

  /** 城市点在世界坐标里的位置（就地写入 tmpWorld） */
  function worldOf(idx) {
    return tmpWorld
      .set(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2])
      .applyMatrix4(earth.matrixWorld);
  }

  const api = {
    points,
    marker,
    count: N,

    /** 城市点在屏幕上的像素位置；被地球挡住时返回 null */
    screenPos(idx, camera, width, height) {
      const p = worldOf(idx).clone().project(camera);
      if (p.z > 1) return null;
      const dirToCam = tmpDir.copy(camera.position).sub(tmpWorld).normalize();
      const n = tmpWorld.clone().normalize();
      if (n.dot(dirToCam) < 0.06) return null;
      return {
        x: (p.x * 0.5 + 0.5) * width,
        y: (-p.y * 0.5 + 0.5) * height,
        z: p.z
      };
    },

    /** 命中测试，返回城市索引或 −1 */
    pick(clientX, clientY, camera, width, height) {
      ndc.x = (clientX / width) * 2 - 1;
      ndc.y = -(clientY / height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(points, false);
      for (const hit of hits) {
        if (hit.index == null) continue;
        if (api.screenPos(hit.index, camera, width, height)) return hit.index;
      }
      return -1;
    },

    select(idx) {
      const c = cities[idx];
      marker.visible = true;
      marker.position.copy(toXYZ(c[2], c[3], EARTH_RADIUS * 1.016));
    },

    setSelected(idx) {
      if (idx < 0) { marker.visible = false; return; }
      api.select(idx);
    },

    /** 标记的呼吸动画 */
    animate(t) {
      if (!marker.visible) return;
      const pulse = 1 + Math.sin(t * 0.004) * 0.12;
      marker.scale.set(0.085 * pulse, 0.085 * pulse, 1);
    },

    setSunDirection(v) {
      mat.uniforms.sunDir.value.copy(v);
    }
  };

  return api;
}
