/* ============================================================
   album.js — 相册：自适应等高行布局 + 视频悬停播放 + Lightbox
   ============================================================ */
(function () {
  const TARGET_ROW_H = 260;   // 目标行高（px）
  const GAP = 6;              // 与 CSS --gap 保持一致
  const MAX_LAST_ROW_SCALE = 1.4; // 最后一行最多放大到目标行高的多少倍

  const params = new URLSearchParams(location.search);
  const placeId = params.get("place");

  const gallery = document.getElementById("gallery");
  let place = null;

  // SVG 图标
  const ICON_PLAY =
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_LIVE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<circle cx="12" cy="12" r="3"/><path d="M5.5 8a8 8 0 0 0 0 8M18.5 8a8 8 0 0 1 0 8" ' +
    'stroke-linecap="round"/></svg>';

  // ----------------------------------------------------------
  // 数据加载
  // ----------------------------------------------------------
  fetch("assets/data/manifest.json")
    .then((r) => r.json())
    .then((manifest) => {
      place = manifest.places.find((p) => p.id === placeId) || manifest.places[0];
      if (!place) throw new Error("找不到地点");
      renderHeader();
      buildTiles();
      layout();
    })
    .catch((err) => {
      console.error(err);
      gallery.innerHTML = '<p style="color:#8a8d94;padding:40px">加载失败。</p>';
    });

  function renderHeader() {
    document.title = place.name + " · Alexia & Alan";
    document.getElementById("title").textContent = place.name;
    document.getElementById("titleEn").textContent = place.nameEn || "";
    document.getElementById("count").textContent = place.count + " 张";
  }

  // ----------------------------------------------------------
  // 创建瓦片（一次性，布局时只改尺寸）
  // ----------------------------------------------------------
  const tiles = []; // { el, item, ar }

  function buildTiles() {
    place.items.forEach((item, idx) => {
      const ar = (item.w && item.h) ? item.w / item.h : 1;
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.index = idx;

      let media;
      if (item.type === "video") {
        media = document.createElement("video");
        media.className = "media";
        media.muted = true;
        media.loop = true;
        media.playsInline = true;
        media.preload = "metadata";
        media.poster = item.poster || "";
        const source = document.createElement("source");
        source.src = item.src;
        source.type = "video/mp4";
        media.appendChild(source);

        const badge = document.createElement("span");
        badge.className = "badge";
        badge.innerHTML = (item.live ? ICON_LIVE + "LIVE" : ICON_PLAY + "视频");
        tile.appendChild(media);
        tile.appendChild(badge);

        // 悬停：放大 + 自动播放（静音）
        tile.addEventListener("mouseenter", () => {
          const pr = media.play();
          if (pr && pr.catch) pr.catch(() => {});
        });
        tile.addEventListener("mouseleave", () => {
          media.pause();
        });
      } else {
        media = document.createElement("img");
        media.className = "media";
        media.loading = "lazy";
        media.src = item.src;
        media.alt = place.name;
        tile.appendChild(media);
      }

      tile.addEventListener("click", () => openLightbox(idx));
      gallery.appendChild(tile);
      tiles.push({ el: tile, item: item, ar: ar });
    });
  }

  // ----------------------------------------------------------
  // 等高行（justified）布局
  // ----------------------------------------------------------
  function layout() {
    const containerW = gallery.clientWidth - getPad();
    if (containerW <= 0) return;

    // 先清掉旧的 row 包装，把 tile 收集回来
    // 用文档碎片重排：按行分组
    let row = [];
    let arSum = 0;
    const rows = [];

    tiles.forEach((t) => {
      row.push(t);
      arSum += t.ar;
      // 当前行铺满到目标高度所需宽度
      const rowW = arSum * TARGET_ROW_H + GAP * (row.length - 1);
      if (rowW >= containerW) {
        rows.push({ items: row, arSum: arSum, full: true });
        row = [];
        arSum = 0;
      }
    });
    if (row.length) rows.push({ items: row, arSum: arSum, full: false });

    // 重建 DOM 结构：gallery -> .row -> .tile
    const frag = document.createDocumentFragment();
    rows.forEach((r) => {
      const rowEl = document.createElement("div");
      rowEl.className = "row";

      let h;
      if (r.full) {
        h = (containerW - GAP * (r.items.length - 1)) / r.arSum;
      } else {
        // 最后一行：保持目标高度，不强行拉伸（但限制不要过大）
        h = Math.min(TARGET_ROW_H * MAX_LAST_ROW_SCALE, TARGET_ROW_H);
      }
      r.items.forEach((t) => {
        t.el.style.height = h + "px";
        t.el.style.width = (t.ar * h) + "px";
        rowEl.appendChild(t.el);
      });
      frag.appendChild(rowEl);
    });

    // 清空旧 row 容器后写入
    gallery.querySelectorAll(".row").forEach((n) => n.remove());
    gallery.appendChild(frag);
  }

  function getPad() {
    const cs = getComputedStyle(gallery);
    return parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  }

  // resize 防抖重排
  let rT;
  window.addEventListener("resize", () => {
    clearTimeout(rT);
    rT = setTimeout(layout, 120);
  });

  // ----------------------------------------------------------
  // Lightbox
  // ----------------------------------------------------------
  const lb = document.getElementById("lightbox");
  const lbStage = document.getElementById("lbStage");
  const lbCounter = document.getElementById("lbCounter");
  let curIndex = -1;

  function openLightbox(idx) {
    curIndex = idx;
    showCurrent();
    lb.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    lb.classList.remove("open");
    lbStage.innerHTML = "";
    document.body.style.overflow = "";
    curIndex = -1;
  }

  function showCurrent() {
    const item = place.items[curIndex];
    lbStage.innerHTML = "";
    let node;
    if (item.type === "video") {
      node = document.createElement("video");
      node.src = item.src;
      node.poster = item.poster || "";
      node.controls = true;
      node.autoplay = true;
      node.loop = !!item.live;     // Live 短片循环，长视频不循环
      node.playsInline = true;
      // 默认带声音播放长视频；若浏览器阻止自动播放则保持静音回退
      node.muted = false;
      const pr = node.play();
      if (pr && pr.catch) pr.catch(() => { node.muted = true; node.play().catch(() => {}); });
    } else {
      node = document.createElement("img");
      node.src = item.src;
      node.alt = place.name;
    }
    lbStage.appendChild(node);
    lbCounter.textContent = (curIndex + 1) + " / " + place.items.length;
  }

  function next(dir) {
    curIndex = (curIndex + dir + place.items.length) % place.items.length;
    showCurrent();
  }

  document.getElementById("lbClose").addEventListener("click", closeLightbox);
  document.getElementById("lbPrev").addEventListener("click", (e) => { e.stopPropagation(); next(-1); });
  document.getElementById("lbNext").addEventListener("click", (e) => { e.stopPropagation(); next(1); });
  lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });

  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") next(-1);
    else if (e.key === "ArrowRight") next(1);
  });
})();
