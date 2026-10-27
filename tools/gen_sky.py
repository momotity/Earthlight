#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_sky.py — 由 d3-celestial 的星表与星座连线生成 src/data/sky.js

数据来源（已下载到 tools/raw/）：
  stars.6.json            Yale 亮星表子集，5044 颗，6 等以上
  constellations.lines.json  88 星座的星间连线（MultiLineString，坐标为 [RA, Dec] 度）

输出：E S 模块，形如
  export default {
    stars: [ra, dec, mag, bv, ...],      // 每 4 个数一颗星
    lines: [[ra,dec, ra,dec, ...], ...], // 每条折线扁平存储
    names: [[ra, dec, '猎户座', 'Ori', 3], ...]
  }

名称锚点的挑选：
  先把该星座所有连线端点的方向向量求平均（球面重心），再在所有端点里
  找与重心夹角最小的那一个 —— 保证名字落在星座线上，而不是飘在空白处。
"""
import json
import math
import os

BASE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(BASE, "raw")
OUT = os.path.join(BASE, "..", "src", "data", "sky.js")

# ---- IAUP 88 星座中文名 ----
CN = {
    "And": "仙女座", "Ant": "唧筒座", "Aps": "天燕座", "Aqr": "宝瓶座", "Aql": "天鹰座",
    "Ara": "天坛座", "Ari": "白羊座", "Aur": "御夫座", "Boo": "牧夫座", "Cae": "雕具座",
    "Cam": "鹿豹座", "Cnc": "巨蟹座", "CVn": "猎犬座", "CMa": "大犬座", "CMi": "小犬座",
    "Cap": "摩羯座", "Car": "船底座", "Cas": "仙后座", "Cen": "半人马座", "Cep": "仙王座",
    "Cet": "鲸鱼座", "Cha": "蝘蜓座", "Cir": "圆规座", "Col": "天鸽座", "Com": "后发座",
    "CrA": "南冕座", "CrB": "北冕座", "Crv": "乌鸦座", "Crt": "巨爵座", "Cru": "南十字座",
    "Cyg": "天鹅座", "Del": "海豚座", "Dor": "剑鱼座", "Dra": "天龙座", "Equ": "小马座",
    "Eri": "波江座", "For": "天炉座", "Gem": "双子座", "Gru": "天鹤座", "Her": "武仙座",
    "Hor": "时钟座", "Hya": "长蛇座", "Hyi": "水蛇座", "Ind": "印第安座", "Lac": "蝎虎座",
    "Leo": "狮子座", "LMi": "小狮座", "Lep": "天兔座", "Lib": "天秤座", "Lup": "豺狼座",
    "Lyn": "天猫座", "Lyr": "天琴座", "Men": "山案座", "Mic": "显微镜座", "Mon": "麒麟座",
    "Mus": "苍蝇座", "Nor": "矩尺座", "Oct": "南极座", "Oph": "蛇夫座", "Ori": "猎户座",
    "Pav": "孔雀座", "Peg": "飞马座", "Per": "英仙座", "Phe": "凤凰座", "Pic": "绘架座",
    "Psc": "双鱼座", "PsA": "南鱼座", "Pup": "船尾座", "Pyx": "罗盘座", "Ret": "网罟座",
    "Sge": "天箭座", "Sgr": "人马座", "Sco": "天蝎座", "Scl": "玉夫座", "Sct": "盾牌座",
    "Ser": "巨蛇座", "Sex": "六分仪座", "Tau": "金牛座", "Tel": "望远镜座", "Tri": "三角座",
    "TrA": "南三角座", "Tuc": "杜鹃座", "UMa": "大熊座", "UMi": "小熊座", "Vel": "船帆座",
    "Vir": "室女座", "Vol": "飞鱼座", "Vul": "狐狸座",
}

# 标注优先级：数字越小越优先显示（同屏位置冲突时优先保留）
# 前 24 个是中国人最耳熟能详、形状最好认的，开机画面就能看到它们
PRIORITY = [
    "UMa", "Ori", "Tau", "Sco", "Sgr", "Cyg", "Lyr", "Aql",          # 0-7  四季招牌
    "Cas", "UMi", "Leo", "Gem", "Cnc", "Vir", "Lib", "Ari",          # 8-15 黄道/北极
    "Psc", "Cap", "Aqr", "Boo", "Her", "Per", "And", "Peg",          # 16-23
    "CMa", "CMi", "Aur", "CrB", "Dra", "Del", "Cet", "Lep",          # 24-31
    "Oph", "Cen", "Cru", "Car", "Cep", "Lup", "Cvn", "Hya",          # 32-39 更长尾
]
PRIO_MAP = {cid: i for i, cid in enumerate(PRIORITY)}
DEFAULT_PRIO = 60


def unit(ra_deg, dec_deg):
    ra = math.radians(ra_deg)
    dec = math.radians(dec_deg)
    return (math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec))


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def to_radec(v):
    x, y, z = v
    n = math.sqrt(x * x + y * y + z * z)
    if n < 1e-9:
        return None
    x, y, z = x / n, y / n, z / n
    dec = math.degrees(math.asin(max(-1.0, min(1.0, z))))
    ra = math.degrees(math.atan2(y, x)) % 360
    return ra, dec


def main():
    stars = json.load(open(os.path.join(RAW, "s_stars6.json"), encoding="utf-8"))["features"]
    lines = json.load(open(os.path.join(RAW, "s_lines.json"), encoding="utf-8"))["features"]

    # ---------- 恒星：[ra, dec, mag, bv] ----------
    sflat = []
    for f in stars:
        ra, dec = f["geometry"]["coordinates"]
        p = f["properties"]
        mag = float(p.get("mag", 6.0))
        bv = float(p.get("bv") or 0.6)
        bv = max(-0.4, min(2.0, bv))
        sflat += [round(ra, 2), round(dec, 2), round(mag, 2), round(bv, 2)]

    # ---------- 星座连线 ----------
    lout = []
    name_map = {}
    for f in lines:
        cid = f["id"]
        coords = f["geometry"]["coordinates"]

        for seg in coords:
            arr = []
            for ra, dec in seg:
                arr += [round(ra, 2), round(dec, 2)]
            if len(arr) >= 4:
                lout.append(arr)

        if cid not in CN or cid in name_map:
            continue

        # 该星座在天空里占据的点（去重），供前端每帧算「可见部分的屏幕重心」。
        # 只靠一个固定锚点是不够的：星座中心常常落在地球背面或屏幕外，
        # 而星座本身还在画面边缘露着头 —— 那就应该把名字贴到露出来的那一截上。
        seen = set()
        flat = []
        for seg in coords:
            for ra, dec in seg:
                key = (round(ra, 1), round(dec, 1))
                if key in seen:
                    continue
                seen.add(key)
                flat += [round(ra, 2), round(dec, 2)]

        name_map[cid] = [CN[cid], cid, PRIO_MAP.get(cid, DEFAULT_PRIO), flat]

    names = list(name_map.values())
    names.sort(key=lambda n: n[2])

    def fmt_num(v):
        return repr(v) if isinstance(v, float) else str(v)

    parts = [
        "/* 自动生成，请勿手改 —— 由 tools/gen_sky.py 从 tools/raw/*.json 生成 */\n",
        "export default {\n",
        "  stars: [" + ",".join(fmt_num(x) for x in sflat) + "],\n",
        "  lines: [" + ",".join("[" + ",".join(fmt_num(x) for x in a) + "]" for a in lout) + "],\n",
        "  names: [" + ",".join(
            '["%s","%s",%d,[%s]]' % (
                a[0], a[1], a[2], ",".join(fmt_num(x) for x in a[3])
            )
            for a in names
        ) + "]\n",
        "};\n",
    ]
    js = "".join(parts)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8").write(js)

    print("恒星 %d 颗 | 折线 %d 条 | 命名星座 %d 个" % (len(stars), len(lout), len(names)))
    print("输出 %s （%.0f KB）" % (os.path.normpath(OUT), len(js.encode()) / 1024))


if __name__ == "__main__":
    main()
