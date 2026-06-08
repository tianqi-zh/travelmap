# TravelMap · 旅行地图

记录去过的地方与影像。主页是一张暗色世界地图，去过的城市是发光圆点；点击进入该城市相册，图片与视频等高行混排，鼠标悬停视频会微微放大并自动播放。零依赖纯静态站点。

## 目录

```
index.html            世界地图主页
album.html            相册页（album.html?place=<city>）
build.py              媒体转换 + 生成 manifest
serve.sh              本地预览
assets/
  css/style.css
  js/map.js           地图渲染 + 圆点 + 跳转
  js/album.js         等高行布局 + 悬停播放 + lightbox
  data/world.geo.json 世界国界（Natural Earth 110m）
  data/manifest.json  build.py 生成，请勿手改
media/
  raw/                原始素材（保持不动）
  <city>/             转换后的 jpg / mp4 / 海报
```

## 使用

```bash
# 1) 转换素材并生成清单（用装了 imageio-ffmpeg 的环境）
conda activate py313
python build.py

# 2) 本地预览
./serve.sh            # 然后打开 http://localhost:8000
```

`build.py` 会：
- HEIC / 大图 → 压缩 JPG（`sips`，长边 ≤ 2400）
- Live 照片（HEIC + MOV）→ 海报 JPG + MP4（悬停播放的短片，压得较狠）
- 长视频 → MP4（较高画质）+ 抽帧海报
- 普通 JPG → 压缩
- 把每个城市的条目与宽高写进 `assets/data/manifest.json`

可重复运行：已生成且较新的文件会跳过。视频用 `imageio-ffmpeg` 自带的 ffmpeg，HEIC 用 macOS 自带 `sips`。

## 加一个新地点

1. 把素材放进 `media/raw/<city>/<条目>/`（每个条目一个子文件夹，Live 照片把 HEIC 和 MOV 放一起）。
2. 在 `build.py` 顶部的 `PLACES` 里加一行该城市的中文名 / 英文名 / 经纬度。
3. 重新运行 `python build.py`，刷新页面即可。

## 自定义

- 主题色：改 `assets/css/style.css` 里的 `--accent`。
- 相册行高 / 间距：改 `assets/js/album.js` 的 `TARGET_ROW_H`、`GAP`（GAP 要和 CSS 的 `--gap` 一致）。
- 视频压缩力度：改 `build.py` 的 `LIVE_*` / `LONG_*` 参数。
