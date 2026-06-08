#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TravelMap 构建脚本
------------------
把 ./media/raw/<city>/<entry>/ 里的原始素材转换成网页可用的文件：
  - HEIC 静图        -> JPG (sips, 长边 <= MAX_EDGE)
  - 普通 JPG         -> 压缩 JPG (sips)
  - MOV (Live/长视频) -> MP4 (ffmpeg, H.264, faststart)
  - Live 照片         -> 海报 JPG + MP4，视频瓦片(live=true)
  - 长视频           -> MP4 + 抽帧海报，视频瓦片(live=false)
然后把每个城市的条目（含宽高）写进 assets/data/manifest.json。

可重复运行：已存在且较新的输出会被跳过。

环境：macOS 自带 sips；ffmpeg 取自 imageio_ffmpeg（py313 环境）。
未来加新地点：在 media/raw/ 下新建 <city>/ 放素材，在下方 PLACES 里加一行坐标，重跑本脚本。
"""

import json
import os
import re
import shutil
import subprocess
import sys

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------
ROOT = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(ROOT, "media", "raw")
OUT_DIR = os.path.join(ROOT, "media")
MANIFEST_PATH = os.path.join(ROOT, "assets", "data", "manifest.json")

MAX_EDGE = 2400          # 图片长边上限（像素）
JPG_QUALITY = "high"     # sips 压缩质量
POSTER_AT = "00:00:01"   # 长视频抽海报的时间点

# 视频编码参数：Live 短片只是悬停预览，压得更狠；长视频保留较高画质
LIVE_MAX_W, LIVE_CRF = 1280, 28
LONG_MAX_W, LONG_CRF = 1920, 23

# 城市坐标与展示名（id 必须等于 media/raw 下的文件夹名）
PLACES = {
    "dalian": {"name": "大连", "nameEn": "Dalian", "lat": 38.914, "lng": 121.615},
    "jeju":   {"name": "济州", "nameEn": "Jeju",   "lat": 33.499, "lng": 126.531},
}

IMG_EXTS = {".jpg", ".jpeg", ".heic", ".heif", ".png"}
VID_EXTS = {".mov", ".mp4", ".m4v"}


# ---------------------------------------------------------------------------
# 工具
# ---------------------------------------------------------------------------
def get_ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as e:
        print("无法找到 ffmpeg，请确认 py313 环境已激活且装有 imageio-ffmpeg。", file=sys.stderr)
        raise


FFMPEG = get_ffmpeg()


def run(cmd):
    """运行命令，失败抛异常并打印 stderr。"""
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode != 0:
        sys.stderr.write(res.stderr.decode("utf-8", "ignore"))
        raise RuntimeError("命令失败: %s" % " ".join(cmd))
    return res


def needs_build(src, dst):
    """dst 不存在或比 src 旧 -> 需要重建。"""
    if not os.path.exists(dst):
        return True
    return os.path.getmtime(dst) > 0 and os.path.getmtime(src) > os.path.getmtime(dst)


def sips_convert(src, dst):
    """HEIC/JPG -> 压缩 JPG，长边限制，自动应用 EXIF 旋转。"""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    run([
        "sips", "-s", "format", "jpeg",
        "-s", "formatOptions", JPG_QUALITY,
        "-Z", str(MAX_EDGE),
        src, "--out", dst,
    ])


def image_size(path):
    """用 sips 取像素宽高（已含 EXIF 方向修正后的输出尺寸）。"""
    res = run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path])
    out = res.stdout.decode("utf-8", "ignore")
    w = re.search(r"pixelWidth:\s*(\d+)", out)
    h = re.search(r"pixelHeight:\s*(\d+)", out)
    return (int(w.group(1)), int(h.group(1))) if (w and h) else (0, 0)


def video_size(path):
    """用 ffmpeg 探测主视频流的显示宽高（考虑旋转 metadata）。"""
    res = subprocess.run([FFMPEG, "-i", path],
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    info = res.stderr.decode("utf-8", "ignore")
    # 第一条 Video 流
    m = re.search(r"Video:.*?(\d{2,5})x(\d{2,5})", info)
    w, h = (int(m.group(1)), int(m.group(2))) if m else (0, 0)
    # 旋转
    rot = re.search(r"rotation of (-?\d+)", info) or re.search(r"displaymatrix:.*rotation of (-?\d+)", info)
    if rot and abs(int(rot.group(1))) % 180 == 90:
        w, h = h, w
    return w, h


def mov_to_mp4(src, dst, max_w, crf):
    """MOV -> web MP4：只取主视频流 + 第一条音频，H.264 yuv420p faststart。"""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    run([
        FFMPEG, "-y", "-i", src,
        "-map", "0:v:0", "-map", "0:a:0?",
        "-c:v", "libx264", "-crf", str(crf), "-preset", "slow",
        "-vf", "scale='min(%d,iw)':-2" % max_w,
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "128k",
        dst,
    ])


def extract_poster(src, dst):
    """从视频抽一帧做海报。"""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    run([
        FFMPEG, "-y", "-ss", POSTER_AT, "-i", src,
        "-frames:v", "1",
        "-vf", "scale='min(%d,iw)':-2" % MAX_EDGE,
        "-q:v", "3",
        dst,
    ])


def list_entries(city_raw):
    """返回 city_raw 下的条目子文件夹（按名排序）。"""
    items = []
    for name in sorted(os.listdir(city_raw)):
        p = os.path.join(city_raw, name)
        if os.path.isdir(p):
            items.append((name, p))
    return items


def pick_files(entry_dir):
    """收集条目里的图片/视频文件，优先 'E' 编辑版，忽略 .AAE/.DS_Store。"""
    imgs, vids = {}, {}   # key=去掉E前缀的基名 -> (是否编辑版, 路径)
    for fn in os.listdir(entry_dir):
        if fn.startswith(".") or fn.lower().endswith(".aae"):
            continue
        path = os.path.join(entry_dir, fn)
        if not os.path.isfile(path):
            continue
        base, ext = os.path.splitext(fn)
        ext = ext.lower()
        # 判断是否编辑版：IMG_E1234 / DSCFE1036 等，'E' 紧跟在字母前缀后
        edited = bool(re.match(r"^[A-Za-z]+E\d", base))
        key = re.sub(r"^([A-Za-z]+)E(\d)", r"\1\2", base)  # 归一化基名
        target = imgs if ext in IMG_EXTS else (vids if ext in VID_EXTS else None)
        if target is None:
            continue
        prev = target.get(key)
        if prev is None or (edited and not prev[0]):
            target[key] = (edited, path)
    return ([p for _, p in imgs.values()], [p for _, p in vids.values()])


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def build_city(city_id):
    city_raw = os.path.join(RAW_DIR, city_id)
    if not os.path.isdir(city_raw):
        print("  跳过（无 raw 目录）:", city_id)
        return None

    meta = PLACES.get(city_id, {"name": city_id, "nameEn": city_id, "lat": 0, "lng": 0})
    out_city = os.path.join(OUT_DIR, city_id)
    os.makedirs(out_city, exist_ok=True)

    items = []
    for entry_name, entry_dir in list_entries(city_raw):
        imgs, vids = pick_files(entry_dir)
        stem = re.sub(r"^([A-Za-z]+)E(\d)", r"\1\2", entry_name)  # 输出文件名用归一化基名

        if vids:
            # 视频条目：有同名静图 -> Live 短片；否则 -> 长视频
            src_v = vids[0]
            live = bool(imgs)
            max_w, crf = (LIVE_MAX_W, LIVE_CRF) if live else (LONG_MAX_W, LONG_CRF)
            mp4 = os.path.join(out_city, stem + ".mp4")
            if needs_build(src_v, mp4):
                print("  视频%s ->" % ("(Live)" if live else "(长)"),
                      os.path.relpath(mp4, ROOT))
                mov_to_mp4(src_v, mp4, max_w, crf)
            # 海报：Live 用静图，长视频抽帧
            poster = os.path.join(out_city, stem + ".jpg")
            if live:
                if needs_build(imgs[0], poster):
                    sips_convert(imgs[0], poster)
            else:
                if needs_build(src_v, poster):
                    extract_poster(mp4, poster)
            w, h = image_size(poster)
            if not w:
                w, h = video_size(mp4)
            items.append({
                "type": "video",
                "src": os.path.relpath(mp4, ROOT).replace(os.sep, "/"),
                "poster": os.path.relpath(poster, ROOT).replace(os.sep, "/"),
                "w": w, "h": h, "live": live,
            })
        elif imgs:
            # 纯图片条目
            src_i = imgs[0]
            jpg = os.path.join(out_city, stem + ".jpg")
            if needs_build(src_i, jpg):
                print("  图片 ->", os.path.relpath(jpg, ROOT))
                sips_convert(src_i, jpg)
            w, h = image_size(jpg)
            items.append({
                "type": "image",
                "src": os.path.relpath(jpg, ROOT).replace(os.sep, "/"),
                "w": w, "h": h,
            })

    if not items:
        print("  （无可用素材）", city_id)
        return None

    cover = items[0].get("poster") or items[0]["src"]
    return {
        "id": city_id,
        "name": meta["name"],
        "nameEn": meta["nameEn"],
        "lat": meta["lat"],
        "lng": meta["lng"],
        "cover": cover,
        "count": len(items),
        "items": items,
    }


def main():
    if not os.path.isdir(RAW_DIR):
        print("找不到 media/raw 目录。", file=sys.stderr)
        sys.exit(1)

    print("ffmpeg:", FFMPEG)
    places = []
    # 按 raw 下实际存在的城市处理（PLACES 提供坐标）
    city_ids = sorted([d for d in os.listdir(RAW_DIR)
                       if os.path.isdir(os.path.join(RAW_DIR, d))])
    for city_id in city_ids:
        print("城市:", city_id)
        rec = build_city(city_id)
        if rec:
            places.append(rec)

    os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)
    manifest = {
        "_comment": "由 build.py 生成，请勿手改。加新地点：把素材放进 media/raw/<city>/，在 build.py 的 PLACES 加坐标，重跑。",
        "places": places,
    }
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    total = sum(p["count"] for p in places)
    print("\n完成：%d 个城市，%d 个媒体条目 -> %s"
          % (len(places), total, os.path.relpath(MANIFEST_PATH, ROOT)))


if __name__ == "__main__":
    main()
