/**
 * scene/earth.js — 地球本体 / 云层 / 大气辉光
 *
 * 三件东西各是一个球壳，共用同一个太阳方向 uniform：
 *   1. 地表：昼夜两张贴图按 N·L 混合，晨昏线附近叠一层暖色散射
 *   2. 云层：略大的球，随昼夜变亮、日落时染暖
 *   3. 大气：BackSide 球壳做边缘辉光，只在受光侧发光
 */
import * as THREE from 'three';
import { EARTH_RADIUS } from '../config.js';

const DAY_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const DAY_FRAG = /* glsl */`
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDir;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vW;

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    float ndl = dot(N, sunDir);

    vec3 dayC = texture2D(dayMap, vUv).rgb;

    // 夜面：城市灯光 + 极暗的陆地轮廓（贴图本身已做高通，去掉大气辉光）
    float lamp = texture2D(nightMap, vUv).r;
    vec3 nightLit = vec3(1.0, 0.79, 0.50) * pow(lamp, 0.74) * 1.55;
    nightLit += dayC * 0.05;

    // 昼面：亮度跟着太阳高度走 —— 贴着晨昏线的地方是低角度斜射，本来就该暗
    float shade = 0.06 + 1.34 * pow(clamp(ndl, 0.0, 1.0), 0.55);
    vec3 dayLit = dayC * shade * 1.18;

    float mixK = smoothstep(-0.07, 0.12, ndl);
    vec3 col = mix(nightLit, dayLit, mixK);

    // 晨昏线暖色散射：低角度阳光穿过更厚的大气，先红、再白热
    float eq = 0.55 + 0.45 * clamp(1.0 - abs(N.y), 0.0, 1.0);
    float band = exp(-pow(ndl / 0.034, 2.0));
    float core = exp(-pow(ndl / 0.011, 2.0));
    col += vec3(1.00, 0.38, 0.10) * band * 0.30 * eq;
    col += vec3(1.00, 0.82, 0.58) * core * 0.26 * eq;

    // 海洋镜面高光
    float ocean = smoothstep(0.03, 0.16, dayC.b - dayC.r);
    vec3 H = normalize(sunDir + V);
    float sd = max(dot(N, H), 0.0001);
    float spec = exp(-120.0 * (1.0 - sd)) * ocean * 0.16;
    col += vec3(0.85, 0.93, 1.0) * spec;

    // 边缘大气散射
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.2);
    float atmLit = smoothstep(-0.35, 0.55, ndl);
    col += vec3(0.26, 0.52, 0.96) * fres * (0.16 + 0.75 * atmLit);

    gl_FragColor = vec4(col, 1.0);
  }
`;

const CLOUD_FRAG = /* glsl */`
  uniform sampler2D cloudMap;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vN;

  void main() {
    float a = texture2D(cloudMap, vUv).r;
    a = smoothstep(0.04, 0.62, a);
    if (a < 0.008) discard;
    float ndl = dot(normalize(vN), sunDir);
    float lit = smoothstep(-0.09, 0.32, ndl);
    vec3 col = mix(vec3(0.26, 0.36, 0.60), vec3(1.0), lit);
    float warm = exp(-pow(ndl / 0.17, 2.0));
    col = mix(col, vec3(1.0, 0.60, 0.36), warm * 0.55);
    gl_FragColor = vec4(col, a * (0.05 + 0.78 * lit));
  }
`;

const ATMO_VERT = /* glsl */`
  varying vec3 vNv;
  varying vec3 vW;
  void main() {
    vNv = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ATMO_FRAG = /* glsl */`
  uniform vec3 sunDir;
  varying vec3 vNv;
  varying vec3 vW;
  void main() {
    float rim = pow(clamp(1.0 + vNv.z, 0.0, 1.0), 5.0);
    vec3 N = normalize(vW);
    float lit = smoothstep(-0.45, 0.75, dot(N, sunDir));
    vec3 c = mix(vec3(0.04, 0.13, 0.40), vec3(0.30, 0.62, 1.0), lit);
    gl_FragColor = vec4(c, rim * (0.05 + 0.60 * lit));
  }
`;

/**
 * @param {THREE.Scene} scene
 * @param {{day:string, night:string, clouds:string, anisotropy:number}} urls
 */
export function createEarth(scene, urls) {
  const sunDir = new THREE.Vector3(1, 0, 0);

  const uniforms = {
    dayMap: { value: null },
    nightMap: { value: null },
    sunDir: { value: sunDir },
    uTime: { value: 0 }
  };

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, 128, 84),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: DAY_VERT,
      fragmentShader: DAY_FRAG
    })
  );
  scene.add(earth);

  // ---- 云层 ----
  const cloudUniforms = { cloudMap: { value: null }, sunDir: { value: sunDir } };
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.004, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: cloudUniforms,
      vertexShader: DAY_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false
    })
  );
  earth.add(clouds);

  // ---- 大气辉光（不随地球自转）----
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.055, 64, 48),
    new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: sunDir } },
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false
    })
  );
  scene.add(atmo);

  // ---- 贴图加载 ----
  const loader = new THREE.TextureLoader();
  const tasks = [
    ['dayMap', urls.day],
    ['nightMap', urls.night],
    ['cloudMap', urls.clouds]
  ];
  let pending = tasks.length;
  let resolveAll;
  const ready = new Promise((r) => { resolveAll = r; });

  tasks.forEach(([key, src]) => {
    loader.load(src, (tex) => {
      tex.anisotropy = urls.anisotropy || 1;
      tex.wrapS = THREE.RepeatWrapping;
      if (key === 'cloudMap') {
        cloudUniforms.cloudMap.value = tex;
      } else {
        uniforms[key].value = tex;
      }
      if (--pending === 0) {
        earth.material.needsUpdate = true;
        resolveAll();
      }
    });
  });

  return {
    earth,
    clouds,
    atmo,
    uniforms,
    cloudUniforms,
    ready,
    /** 让地球按直射经度自转：直射点永远对准 +X（太阳方向） */
    setSubsolarLongitude(subLon) {
      earth.rotation.y = -subLon * (Math.PI / 180);
    },
    setSunDirection(v) {
      sunDir.copy(v);
    }
  };
}
