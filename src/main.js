/**
 * main.js — 装配层
 *
 * 只做三件事：把各模块接起来、维护一个极简的全局状态、跑主循环。
 * 任何具体的天文/渲染/UI 细节都在各自模块里，这里不写实现。
 */
import * as THREE from 'three';

import { CAMERA, SKY_RADIUS, VIEWS } from './config.js';
import { D2R, R2D, clamp, norm360, normAng } from './lib/math.js';
import { solarPosition, sunDirection } from './astronomy/solar.js';
import { skyRotationY, skyTimestamp } from './astronomy/sidereal.js';
import { doyFromDate } from './astronomy/format.js';
import { cityState, altitudeOf } from './astronomy/city-state.js';

import { createEarth } from './scene/earth.js';
import { createSun } from './scene/sun.js';
import { createStarfield } from './scene/starfield.js';
import { createCityLayer } from './scene/cities.js';
import { OrbitRig, earthAngularRadius, thetaForSunAngle } from './scene/orbit.js';

import { ControlPanel } from './ui/panel.js';
import { CityCard } from './ui/city-card.js';
import { GoldenList } from './ui/golden-list.js';
import { Hud } from './ui/hud.js';
import { SkyLabels } from './ui/sky-labels.js';
import { SunMarker } from './ui/sun-marker.js';

import CITIES from './data/cities.js';
import SKY from './data/sky.js';

import dayUrl from './assets/textures/day.webp';
import nightUrl from './assets/textures/night.webp';
import cloudUrl from './assets/textures/clouds.webp';

import './styles/main.css';

/* ================= 渲染底座 ================= */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
const PR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(PR);
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  CAMERA.fov,
  window.innerWidth / window.innerHeight,
  CAMERA.near,
  CAMERA.far
);

/* 窄屏时地球整体上移，给底部面板腾位置 */
const NARROW = window.innerWidth < 1000;
const LOOK_Y = NARROW ? -0.36 : 0;

/* ================= 场景对象 ================= */
const sunDirWorld = new THREE.Vector3(1, 0, 0);

const earthKit = createEarth(scene, {
  day: dayUrl,
  night: nightUrl,
  clouds: cloudUrl,
  anisotropy: renderer.capabilities.getMaxAnisotropy()
});

const sun = createSun(scene);
const starfield = createStarfield(scene, SKY, PR);
const cityLayer = createCityLayer(earthKit.earth, CITIES, { pixelRatio: PR, sunDir: sunDirWorld });

/* ================= 全局状态 ================= */
const state = {
  doy: 79,
  speed: 1800,
  simTime: Date.now(),
  selected: -1,
  hovered: -1
};

/* ================= UI ================= */
const hud = new Hud();
const card = new CityCard();
const golden = new GoldenList(CITIES, { onPick: (i) => selectCity(i) });
const sunMarker = new SunMarker(document.getElementById('sunMark'), {
  onClick: () => applyView(view.mode === 'sun' ? 'terminator' : 'sun')
});
const skyLabels = new SkyLabels(
  document.getElementById('skyLabels'),
  { names: starfield.names, radius: SKY_RADIUS * 0.99 },
  camera,
  {
    onSelect: (item) => {
      // 点星座名 → 镜头转到那个星座的方向
      rig.follow = false;
      rig.goal.theta = item.az;
      rig.goal.phi = clamp(Math.PI / 2 - item.dec * D2R, 0.16, Math.PI - 0.16);
    }
  }
);

/* ================= 相机 ================= */
const rig = new OrbitRig(canvas, camera, {
  lookY: LOOK_Y,
  onHover: (x, y) => hoverAt(x, y),
  onPick: () => {
    if (state.hovered >= 0) selectCity(state.hovered);
  }
});

const START_DIST = NARROW ? 7.2 : window.innerWidth < 1320 ? 4.9 : 3.75;
rig.setPose({ theta: 33 * D2R, phi: 76 * D2R, dist: START_DIST });

/* ================= 机位：晨昏线 / 太阳 =================
 * 两者都是真实几何，不做任何「把太阳拉进画面」的补偿，区别只在相机站在哪：
 *   terminator —— α≈96°，正对晨昏线，半亮半暗；太阳在 84° 外，必然出画（用边缘标记指出方向）
 *   sun        —— α≈163°，贴着夜半球，太阳压在地球边缘外，但地球只剩一道亮边
 */
const view = { mode: 'terminator' };

/** 俯仰跟着赤纬走：夏至抬头看北半球，冬至压低 */
function phiForDecl(declDeg) {
  return clamp(76.5 + 0.65 * (declDeg + 12.5), 48, 112) * D2R;
}

/**
 * 由视角模式反解相机方位
 * @param {'terminator'|'sun'} mode
 * @param {{decl:number}} sol 太阳赤纬（弧度）
 */
function poseFor(mode, sol) {
  const phi = phiForDecl(sol.decl * R2D);
  const alpha = mode === 'sun'
    ? 180 - (earthAngularRadius(rig.goal.dist) + VIEWS.sunGap)  // 太阳刚好露在地球边缘外
    : VIEWS.terminator;                                        // 正对晨昏线
  return { theta: thetaForSunAngle(alpha, phi, sol.decl), phi, alpha };
}

/** 转到某个机位；theta 走最短路，避免绕大半圈 */
function goTo(pose, instant) {
  rig.follow = false;
  const d = normAng(pose.theta - rig.goal.theta);
  const next = rig.goal.theta + d;
  rig.goal.theta = next;
  rig.goal.phi = pose.phi;
  if (instant) {
    rig.view.theta = next;
    rig.view.phi = pose.phi;
    rig.vel.theta = 0;
    rig.vel.phi = 0;
    rig.apply();
  }
}

function applyView(mode, instant = false) {
  view.mode = mode;
  goTo(poseFor(mode, solarPosition(state.doy, utcHoursOf(state.simTime))), instant);
  panel.markView(mode);
}

/* ================= 交互实现 ================= */
let lastSubLon = 0;

function hoverAt(clientX, clientY) {
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (clientX < 0) {
    state.hovered = -1;
    hud.hideTip();
    canvas.style.cursor = 'grab';
    return;
  }

  const idx = cityLayer.pick(clientX, clientY, camera, w, h);
  state.hovered = idx;

  if (idx < 0) {
    hud.hideTip();
    canvas.style.cursor = rig.dragging ? 'grabbing' : 'grab';
    return;
  }

  const pos = cityLayer.screenPos(idx, camera, w, h);
  const utcH = utcHoursOf(state.simTime);
  hud.hover(CITIES[idx], pos, utcH);
  canvas.style.cursor = 'pointer';
}

function selectCity(idx) {
  if (idx < 0) return;
  state.selected = idx;
  const c = CITIES[idx];
  cityLayer.select(idx);
  rig.follow = true;
  // 把镜头转到这座城市所在的方位
  const az = norm360(lastSubLon - c[3]);
  rig.rotateTowards(az * D2R, 0.55);
  rig.goal.phi = clamp(rig.goal.phi, 55 * D2R, 105 * D2R);
  updateCard();
}

function utcHoursOf(ms) {
  const d = new Date(ms);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
}

/* ================= 面板 ================= */
const panel = new ControlPanel({
  onDoyChange: (doy, { reframe }) => {
    state.doy = doy;
    syncPanel();
    if (reframe) reframeView();
  },
  onSpeedChange: (spd) => { state.speed = spd; },
  onReset: () => {
    state.simTime = Date.now();
    state.doy = doyFromDate(new Date(state.simTime));
    syncPanel();
    if (state.selected >= 0) updateCard();
  },
  onSkyToggle: (on) => skyLabels.setEnabled(on),
  onViewChange: (mode) => applyView(mode)
});

function syncPanel() {
  const sol = solarPosition(state.doy, 12);
  panel.sync({ doy: state.doy, declDeg: sol.decl * R2D });
}

/** 赤纬变了，俯仰要跟上，否则晨昏线/太阳会飘出画面 */
function reframeView() {
  const sol = solarPosition(state.doy, utcHoursOf(state.simTime));
  const pose = poseFor(view.mode, sol);
  if (Math.abs(rig.view.phi - pose.phi) * R2D > 12) goTo(pose, false);
}

function updateCard() {
  if (state.selected < 0) return;
  const c = CITIES[state.selected];
  card.render(c, cityState(c, new Date(state.simTime), state.doy));
}

/* ================= 初始机位：正对晨昏线 =================
 * 走进来第一眼要看到「光与影」—— 半亮半暗的地球 + 城市灯光 + 晨昏暖边。
 * 相机与太阳的夹角 α 取 96°：晨昏线正好压在画面正中，此刻正在日出/日落的城市就在眼前。
 * 太阳因此在 84° 开外（数学上必然出画），由画面边缘的方位标记指出位置。
 */
(function initialPose() {
  state.simTime = Date.now();
  state.doy = doyFromDate(new Date(state.simTime));
  syncPanel();
  panel.markSpeed(state.speed);

  const sol = solarPosition(state.doy, utcHoursOf(state.simTime));
  lastSubLon = sol.subLon;

  const pose = poseFor('terminator', sol);
  rig.setPose({ theta: pose.theta, phi: pose.phi });
  rig.follow = false;
  rig.apply();

  // 画面正中此刻压着晨昏线 —— 挑一座「正在日出或日落」且离画面中心最近的城市
  const centerLon = norm360(sol.subLon - pose.theta * R2D + 540) - 180;
  let best = -1;
  let bestScore = 1e9;
  for (let i = 0; i < CITIES.length; i++) {
    const c = CITIES[i];
    const alt = Math.abs(altitudeOf(c[2], c[3], sol.decl, sol.subLon));
    const dLon = Math.abs(((c[3] - centerLon + 540) % 360) - 180);
    const score = alt + dLon * 0.22 + (c[5] === 8 ? 0 : 6);  // 优先东八区
    if (score < bestScore) { bestScore = score; best = i; }
  }
  if (best >= 0) {
    state.selected = best;
    cityLayer.select(best);
    updateCard();
  }
  panel.markView('terminator');
})();

/* ================= 安全区（星座名避让面板）================= */
let insets = { l: 0, r: 0, t: 0, b: 0 };

function measureInsets() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const left = document.querySelector('.left').getBoundingClientRect();
  const right = document.querySelector('.right').getBoundingClientRect();

  if (W < 1000) {
    // 窄屏：两块面板上下叠放，只有中间一条能放名字
    insets = { l: 6, r: 6, t: Math.round(right.bottom) + 10, b: Math.round(H - left.top) + 10 };
  } else {
    insets = { l: Math.round(left.right) + 14, r: Math.round(W - right.left) + 14, t: 76, b: 92 };
  }
}

measureInsets();

/* ================= 主循环 ================= */
let lastT = performance.now();
let lastCard = 0;
let lastLabels = 0;
let frameCount = 0;

function frame(t) {
  requestAnimationFrame(frame);

  const dt = Math.min((t - lastT) / 1000, 0.1);
  lastT = t;
  state.simTime += dt * 1000 * state.speed;

  const nd = new Date(state.simTime);
  const utcH = utcHoursOf(state.simTime);

  // ---------- 相机 ----------
  rig.update(dt, () => {
    if (!rig.follow || state.selected < 0) return;
    const az = norm360(lastSubLon - CITIES[state.selected][3]) * D2R;
    rig.rotateTowards(az, 0.06);
  });

  // ---------- 天文 ----------
  const sol = solarPosition(state.doy, utcH);
  sunDirection(sol.decl, sunDirWorld);

  earthKit.setSunDirection(sunDirWorld);
  earthKit.setSubsolarLongitude(sol.subLon);
  cityLayer.setSunDirection(sunDirWorld);

  sun.update(sunDirWorld);
  starfield.setSunDirection(sunDirWorld);
  starfield.setRotationY(skyRotationY(
    skyTimestamp(nd.getUTCFullYear(), state.doy, utcH),
    sol.subLon
  ));

  earthKit.atmo.rotation.set(0, 0, 0);
  earthKit.earth.updateMatrixWorld(true);
  starfield.group.updateMatrixWorld(true);
  cityLayer.animate(t);

  // ---------- 星座名称 + 太阳方位标记 ----------
  frameCount++;
  if (frameCount % 2 === 0 && t - lastLabels > 33) {
    lastLabels = t;
    skyLabels.update(
      starfield.group.matrixWorld,
      camera.position,
      window.innerWidth,
      window.innerHeight,
      insets
    );
    sunMarker.update(sunDirWorld, camera, window.innerWidth, window.innerHeight, insets);
  }

  // ---------- 选中城市的名牌 ----------
  if (state.selected >= 0) {
    const pos = cityLayer.screenPos(state.selected, camera, window.innerWidth, window.innerHeight);
    hud.pinAt(CITIES[state.selected][0], pos);
  } else {
    hud.hidePin();
  }

  // ---------- 低频 UI ----------
  hud.clock(nd, {
    subsolarLat: sol.decl * R2D,
    subsolarLon: sol.subLon
  });

  if (t - lastCard > 180) {
    lastCard = t;
    updateCard();
    golden.update(utcH, sol);
  }

  lastSubLon = sol.subLon;
  renderer.render(scene, camera);
}

/* ================= 调试/扩展入口 =================
 * 挂到 window 上便于自查（也方便二次开发时在控制台里改参数）：
 *   __app.state.doy = 172        → 直接换到夏至
 *   __app.skyLabels.lastStats    → 看星座名被过滤的原因
 */
window.__app = {
  state, rig, camera, scene, renderer, earthKit, sun, starfield, cityLayer,
  skyLabels, panel, card, golden,
  getInsets: () => ({ ...insets }),
  /** 切换机位：'terminator' 晨昏线 / 'sun' 太阳 */
  applyView,
  /** 切到某一天（含相机俯仰修正），控制台调参/截图用 */
  setDay: (doy) => {
    state.doy = doy;
    syncPanel();
    reframeView();
  }
};
window.__errs = window.__errs || [];
window.addEventListener('error', (e) => {
  window.__errs.push(`${e.message} @${String(e.filename || '').split('/').pop()}:${e.lineno}`);
});

/* ================= 首帧：等贴图 ================= */
earthKit.ready.then(() => {
  const loader = document.getElementById('loader');
  if (loader) setTimeout(() => loader.classList.add('gone'), 240);
  requestAnimationFrame(frame);
});

/* ================= 自适应 ================= */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  measureInsets();
});
