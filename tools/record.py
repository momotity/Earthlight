#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
录一段页面动画为 GIF。

为什么不用「逐帧 captureScreenshot」：在 swiftshader 软件渲染下，
每次截图都要强制同步渲染一遍，实测 390×844 下每帧 275 ms，
叠加页面自身 9.8 fps，最终只有 3 fps。改用 CDP 的 Page.startScreencast
（合成器推帧 + 逐帧 ack），能拿到接近页面真实帧率的画面。

用法：
    python3 tools/record.py <url> <out.gif> [宽x高] [秒数] [最大宽度]

例：
    python3 tools/record.py "file://$PWD/dist/index.html" zhuhai.gif 390x844 7 390
"""
import io
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdpshot import launch, close_chrome  # noqa: E402

from PIL import Image  # noqa: E402


# 演示脚本：定位珠海 → ×1800 → 晨昏线 → 回到此刻
SETUP = """
(() => {
  const A = window.__app;
  A.selectCity(350);                       // 珠海
  const sp = [...document.querySelectorAll('.speeds button')]
    .find(b => b.dataset.spd === '1800');
  if (sp) sp.click();                      // 自转 ×1800
  const tv = document.querySelector('.views button[data-view="terminator"]');
  if (tv) tv.click();                      // 晨昏线机位
  document.getElementById('resetBtn').click();   // 回到此刻
  return JSON.stringify({
    city: A.state.selected,
    name: document.getElementById('cName').textContent,
    speed: A.state.speed,
    view: (document.querySelector('.views button.on') || {}).dataset?.view,
    now: new Date(A.state.simTime).toISOString()
  });
})()
"""

READY = "!!(window.__app && window.__app.selectCity)"


def wait_ready(c, timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if c.eval(READY):
                return True
        except Exception:
            pass
        time.sleep(0.25)
    return False


def record(url, size=(390, 844), seconds=7.0, settle=2.6):
    p, c = launch(size, 1)
    try:
        c.call("Page.enable")
        c.call("Runtime.enable")
        c.call("Emulation.setDeviceMetricsOverride",
               {"width": size[0], "height": size[1],
                "deviceScaleFactor": 1, "mobile": False})
        c.call("Page.navigate", {"url": url})

        if not wait_ready(c):
            raise RuntimeError("页面 30s 内未就绪，检查 __app 是否挂载")

        time.sleep(2.0)
        print("setup ->", c.eval(SETUP))
        time.sleep(settle)          # 等镜头缓动 + 阻尼收敛

        errs = c.eval("JSON.stringify(window.__errs || [])")
        if errs and errs != "[]":
            print("⚠ 页面报错:", errs)

        c.start_screencast(size[0], size[1], fmt="png")
        frames = c.pump_frames(duration=seconds)
    finally:
        close_chrome(p, c.profile_dir)

    print("采集 %d 帧，跨度 %.2fs" % (len(frames), frames[-1][0] - frames[0][0]))
    return frames


def dedupe(frames):
    """相邻帧字节完全相同就合并（静态画面 screencast 会重复推）。"""
    out = [list(frames[0])]
    for stamp, data in frames[1:]:
        if data == out[-1][1]:
            continue
        out.append([stamp, data])
    print("去重后 %d 帧" % len(out))
    return [(s, d) for s, d in out]


def to_gif(frames, out, colors=256, width=None, min_delay=30, max_delay=400):
    stamps = [s for s, _ in frames]
    imgs = [Image.open(io.BytesIO(d)).convert("RGB") for _, d in frames]

    if width and width < imgs[0].width:
        h = round(imgs[0].height * width / imgs[0].width)
        imgs = [im.resize((width, h), Image.LANCZOS) for im in imgs]

    w, h = imgs[0].size
    n = len(imgs)

    # 每帧显示时长 = 到下一帧的真实时间差（尾帧沿用前一帧）
    dur = [max(min_delay, min(max_delay, int(round((stamps[i + 1] - stamps[i]) * 1000))))
           for i in range(n - 1)]
    dur.append(dur[-1] if dur else 80)

    # 全局调色板：拼成一屏长图后采样量化。逐帧各自 quantize 会让
    # 深色渐变在帧间轻微变色，播放时是肉眼可见的闪烁。
    sheet = Image.new("RGB", (w, h * n))
    for i, im in enumerate(imgs):
        sheet.paste(im, (0, i * h))
    sample = sheet.resize((max(1, w // 3), max(1, (h * n) // 3)), Image.BILINEAR)
    pal = sample.quantize(colors=colors, method=Image.MEDIANCUT)

    pq = [im.quantize(palette=pal, dither=Image.FLOYDSTEINBERG) for im in imgs]

    pq[0].save(out, save_all=True, append_images=pq[1:],
               duration=dur, loop=0, optimize=True)

    kb = os.path.getsize(out) / 1024
    print("GIF -> %s  %dx%d  %d 帧  总时长 %.1fs  %.0f KB"
          % (out, w, h, n, sum(dur) / 1000, kb))
    return kb


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else "about:blank"
    out = sys.argv[2] if len(sys.argv) > 2 else "preview.gif"
    size = (390, 844)
    if len(sys.argv) > 3 and "x" in sys.argv[3]:
        a, b = sys.argv[3].split("x")
        size = (int(a), int(b))
    seconds = float(sys.argv[4]) if len(sys.argv) > 4 else 7.0
    width = int(sys.argv[5]) if len(sys.argv) > 5 else None

    frames = record(url, size=size, seconds=seconds)
    frames = dedupe(frames)
    to_gif(frames, out, width=width)


if __name__ == "__main__":
    main()
