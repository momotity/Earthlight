#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_sky.py — 独立复算星空与星座名位置，和浏览器里的实际渲染对账

为什么要这个脚本：
  星空朝向涉及「赤纬 → 恒星时 → 组旋转 → 相机投影」四步，任何一步差个符号，
  画面上都只是「星星位置不对」，肉眼很难判断。所以用 Python 把整条链路
  重新实现一遍（不复用前端任何代码），再和浏览器里 DOM 标签的实际坐标比对。

校验内容：
  1. 星空组 rotation.y      前端 vs 复算（容差 0.05°）
  2. 每个可见星座名的屏幕坐标 前端 vs 复算（容差 3.5 px）

用法：
  python3 tools/verify_sky.py            # 用 dist/index.html
  python3 tools/verify_sky.py <html路径>
"""
import datetime
import json
import math
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdpshot import launch, close_chrome  # noqa: E402

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKY_R = 560
LABEL_R = SKY_R * 0.99


# ---------------- 纯 Python 复算 ----------------

def to_xyz(lat, lon, r):
    p, l = math.radians(lat), math.radians(lon)
    return (r * math.cos(p) * math.cos(l), r * math.sin(p), -r * math.cos(p) * math.sin(l))


def gmst_deg(ms):
    jd = ms / 86400000 + 2440587.5
    d = jd - 2451545.0
    T = d / 36525
    g = 280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - T ** 3 / 38710000
    return g % 360


def solar(doy, utc_h):
    g = 2 * math.pi / 365.2422 * (doy - 1 + (utc_h - 12) / 24)
    decl = (0.006918
            - 0.399912 * math.cos(g) + 0.070257 * math.sin(g)
            - 0.006758 * math.cos(2 * g) + 0.000907 * math.sin(2 * g)
            - 0.002697 * math.cos(3 * g) + 0.001480 * math.sin(3 * g))
    eot = 229.18 * (0.000075
                    + 0.001868 * math.cos(g) - 0.032077 * math.sin(g)
                    - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    return decl, eot, 15 * (12 - utc_h - eot / 60)


def rot_y(v, ang):
    c, s = math.cos(ang), math.sin(ang)
    return (v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c)


def mat_apply(m, v):
    """three.js 列主序 4x4 矩阵 × 点（w=1）"""
    x, y, z = v
    return (
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
        m[3] * x + m[7] * y + m[11] * z + m[15],
    )


def project_to_screen(world, view_m, proj_m, width, height):
    vx, vy, vz, _ = mat_apply(view_m, world)
    cx, cy, cz, cw = mat_apply(proj_m, (vx, vy, vz))
    if cw == 0:
        return None
    nx, ny, nz = cx / cw, cy / cw, cz / cw
    return ((nx * 0.5 + 0.5) * width, (-ny * 0.5 + 0.5) * height, nz)


def occluded(world, cam, r2=1.0):
    """相机 → 星点 的连线是否穿过地球（半径 1 的球）"""
    vx, vy, vz = world[0] - cam[0], world[1] - cam[1], world[2] - cam[2]
    vv = vx * vx + vy * vy + vz * vz
    if vv == 0:
        return True
    t = -(cam[0] * vx + cam[1] * vy + cam[2] * vz) / vv
    if not (0 < t < 1):
        return False
    x, y, z = cam[0] + vx * t, cam[1] + vy * t, cam[2] + vz * t
    return x * x + y * y + z * z < r2


# ---------------- 与浏览器对账 ----------------

PROBE = r"""
(function () {
  const A = window.__app, L = A.skyLabels;
  const d = new Date(A.state.simTime);
  return JSON.stringify({
    w: innerWidth, h: innerHeight,
    doy: A.state.doy,
    simTime: A.state.simTime,
    utcHours: d.getUTCHours() + d.getUTCMinutes()/60 + d.getUTCSeconds()/3600 + d.getUTCMilliseconds()/3.6e6,
    rotY: A.starfield.group.rotation.y,
    camPos: A.camera.position.toArray(),
    view: A.camera.matrixWorldInverse.elements,
    proj: A.camera.projectionMatrix.elements,
    insets: A.getInsets(),
    labels: L._items.filter(i => i.visible).map(i => [i.name, i.x, i.y])
  });
})()
"""


def main():
    html = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE, "dist", "index.html")
    url = "file://" + os.path.abspath(html)
    size = (1600, 950)

    p, c = launch(size)
    try:
        c.call("Page.enable")
        c.call("Runtime.enable")
        c.call("Emulation.setDeviceMetricsOverride",
               {"width": size[0], "height": size[1], "deviceScaleFactor": 1, "mobile": False})
        c.call("Page.navigate", {"url": url})
        time.sleep(3.5)
        # 关掉自转加速：星空每秒会转 7.5°，标签的平滑会引入偏差
        c.eval("window.__app.state.speed = 1")
        time.sleep(1.2)
        st = json.loads(c.eval(PROBE))
    finally:
        close_chrome(p, c.profile_dir)

    doy = st["doy"]
    utc_h = st["utcHours"]
    decl, eot, sub_lon = solar(doy, utc_h)

    print("视口 %dx%d | 第 %d 天 | UTC %.3f 时 | 太阳赤纬 %.2f° | 直射经度 %.3f°"
          % (st["w"], st["h"], doy, utc_h, math.degrees(decl), sub_lon))

    # 1) 星空旋转
    dt = datetime.datetime.fromtimestamp(st["simTime"] / 1000, datetime.timezone.utc)
    sky_ms = (datetime.datetime(dt.year, 1, 1, tzinfo=datetime.timezone.utc).timestamp() * 1000
              + (doy - 1) * 86400000 + utc_h * 3600000)
    g = gmst_deg(sky_ms)
    expect_rot = -((g + sub_lon) % 360) * math.pi / 180
    d_rot = abs(math.degrees(expect_rot - st["rotY"]))
    d_rot = min(d_rot, 360 - d_rot)
    print("GMST %.3f° | rotation.y 前端 %+.3f° / 复算 %+.3f° | 差 %.4f°  %s"
          % (g, math.degrees(st["rotY"]), math.degrees(expect_rot), d_rot,
             "OK" if d_rot < 0.05 else "!! 超差"))

    # 2) 逐个可见星座名
    raw = open(os.path.join(BASE, "src/data/sky.js"), encoding="utf-8").read()
    raw = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
    raw = raw.replace("export default", "").strip().rstrip(";")
    # JS 对象字面量不是严格 JSON：给键名补上引号
    raw = re.sub(r'(?<=\{|,)\s*(\w+)\s*:', r'"\1":', raw)
    sky = json.loads(raw)
    by_name = {}
    for cn, abbr, prio, flat in sky["names"]:
        by_name[cn] = [to_xyz(flat[i + 1], flat[i], LABEL_R) for i in range(0, len(flat), 2)]

    cam = st["camPos"]
    w, h = st["w"], st["h"]
    ins = st["insets"]
    min_x, max_x = ins["l"] + 6, w - ins["r"] - 6
    min_y, max_y = ins["t"] + 6, h - ins["b"] - 6
    worst = 0.0
    print("\n可见星座名（前端坐标 vs Python 复算）：")
    for name, fx, fy in st["labels"]:
        pts = by_name.get(name)
        if not pts:
            print("  ?? %s 不在星表里" % name)
            continue
        sx = sy = 0.0
        n = 0
        for pt in pts:
            wpt = rot_y(pt, expect_rot)
            if occluded(wpt, cam):
                continue
            r = project_to_screen(wpt, st["view"], st["proj"], w, h)
            if r is None or r[2] > 1 or r[2] < -1:
                continue
            if not (min_x <= r[0] <= max_x and min_y <= r[1] <= max_y):
                continue
            sx += r[0]
            sy += r[1]
            n += 1
        if n == 0:
            print("  ?? %-6s 复算无可见点（前端 %d,%d）" % (name, fx, fy))
            continue
        dist = math.hypot(sx / n - fx, sy / n - fy)
        worst = max(worst, dist)
        print("  %-6s 前端 (%4d,%4d)  复算 (%4d,%4d)  差 %5.1f px"
              % (name, fx, fy, sx / n, sy / n, dist))

    ok = worst < 3.5
    print("\n最大偏差 %.1f px  %s" % (worst, "OK" if ok else "!! 需要检查"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
