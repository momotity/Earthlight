/**
 * config.js — 全站可调参数集中处
 * 想改视觉/数值，先来这里，不要去各模块里翻魔数。
 */

export const EARTH_RADIUS = 1;

/** 太阳视作无穷远，摆在足够远处，只保留方向意义（不做真实距离的透视缩放） */
export const SUN_DISTANCE = 60;
/** 太阳视张角约 2.7°（真实 0.53°，为便于观察放大约 5 倍） */
export const SUN_SCALE = 2.8;

/** 星空球壳半径：必须小于相机的 far 且远大于地球，避免与地球抢深度 */
export const SKY_RADIUS = 560;

export const CAMERA = {
  fov: 52,
  near: 0.05,
  far: 4000,
  minDist: 1.45,
  maxDist: 8.5
};

/**
 * 两种机位（都是真实几何，没有任何「把太阳拉进画面」的补偿）
 *
 * 关键恒等式：太阳在画面里离中心多少度 = 180° − α，α 是「地心看相机」与「地心看太阳」的夹角。
 * 而地球上被照亮的部分占可见圆面的比例 = (1 + cos α) / 2。
 * 于是这俩天生互斥：
 *   α→180°（贴着夜半球看）太阳才进画面，但地球 98% 是黑的；
 *   α→90°（正对晨昏线）地球半亮半暗，可太阳在 90° 外，必然出画。
 * 所以要「光影」就得让太阳待在画面外，用画面边缘的方位标记告诉人它在哪。
 */
export const VIEWS = {
  /** 晨昏线机位：α = 96°，比正对多一点夜面，城市灯光和晨昏暖边同时在画面里 */
  terminator: 96,
  /** 太阳机位：太阳中心越过地球边缘的余量（度），贴着夜半球看 */
  sunGap: 2.6
};

export const SPEEDS = [
  { label: '实时', value: 1 },
  { label: '×300', value: 300 },
  { label: '×1800', value: 1800 },
  { label: '×10800', value: 10800 }
];

export const SEASONS = [
  { label: '春分', doy: 79 },
  { label: '夏至', doy: 172 },
  { label: '秋分', doy: 266 },
  { label: '冬至', doy: 356 }
];

/**
 * 星座名称显示策略
 *  - maxLabels：同屏最多显示几个名字（多了会糊成一片）
 *  - minGap：两个名字在屏幕上的最小间距（px），冲突时保留更靠视野中心的
 */
export const SKY_LABELS = {
  maxLabels: 26,
  minGap: 58,
  fadeEdge: 90
};

export const STARFIELD = {
  lineColor: 0x9cc8ff,
  lineOpacity: 0.58,
  /** 大圆细分的段数：跨度越大分得越细，保证线贴着天球 */
  arcSegmentsMax: 10
};
