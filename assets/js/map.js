/* ============================================================
   map.js — 渲染暗色世界地图 + 城市发光圆点
   等距圆柱(equirectangular)投影，SVG 坐标系 2000 x 1000
   ============================================================ */
(function () {
  const SVG_W = 2000;
  const SVG_H = 1000;
  const SVGNS = "http://www.w3.org/2000/svg";

  // 经纬度 -> SVG 坐标
  function project(lng, lat) {
    return [
      (lng + 180) / 360 * SVG_W,
      (90 - lat) / 180 * SVG_H,
    ];
  }

  // 把一个 ring（[ [lng,lat], ... ]）转成 path 指令
  function ringToPath(ring) {
    let d = "";
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = project(ring[i][0], ring[i][1]);
      d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
    }
    return d + "Z";
  }

  function geometryToPath(geom) {
    let d = "";
    if (geom.type === "Polygon") {
      geom.coordinates.forEach((ring) => { d += ringToPath(ring); });
    } else if (geom.type === "MultiPolygon") {
      geom.coordinates.forEach((poly) => {
        poly.forEach((ring) => { d += ringToPath(ring); });
      });
    }
    return d;
  }

  function el(tag, attrs) {
    const node = document.createElementNS(SVGNS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  function renderCountries(geo) {
    const g = document.getElementById("countries");
    const frag = document.createDocumentFragment();
    geo.features.forEach((f) => {
      const d = geometryToPath(f.geometry);
      if (!d) return;
      frag.appendChild(el("path", { d: d, class: "country" }));
    });
    g.appendChild(frag);
  }

  function renderMarkers(places) {
    const g = document.getElementById("markers");
    places.forEach((p) => {
      const [x, y] = project(p.lng, p.lat);
      const marker = el("g", { class: "marker" });
      marker.appendChild(el("circle", { class: "halo", cx: x, cy: y, r: 5 }));
      marker.appendChild(el("circle", { class: "dot", cx: x, cy: y, r: 4.5 }));
      const label = el("text", {
        class: "label",
        x: x + 12,
        y: y + 5,
      });
      label.textContent = p.name;
      marker.appendChild(label);
      marker.addEventListener("click", () => go(p.id));
      g.appendChild(marker);
    });
  }

  function renderList(places) {
    const list = document.getElementById("placesList");
    places.forEach((p) => {
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML =
        '<span class="swatch"></span>' +
        '<span class="name">' + p.name + '</span>' +
        '<span class="cnt">' + p.count + '</span>';
      item.addEventListener("click", () => go(p.id));
      // 与地图标记联动高亮
      item.addEventListener("mouseenter", () => highlight(p.id, true));
      item.addEventListener("mouseleave", () => highlight(p.id, false));
      item._pid = p.id;
      list.appendChild(item);
    });
  }

  let markerIndex = {};
  function indexMarkers(places) {
    const nodes = document.querySelectorAll("#markers .marker");
    places.forEach((p, i) => { markerIndex[p.id] = nodes[i]; });
  }

  function highlight(id, on) {
    const m = markerIndex[id];
    if (!m) return;
    const dot = m.querySelector(".dot");
    const label = m.querySelector(".label");
    dot.setAttribute("r", on ? 7 : 4.5);
    label.style.opacity = on ? 1 : 0;
  }

  function go(id) {
    window.location.href = "album.html?place=" + encodeURIComponent(id);
  }

  // 加载数据
  Promise.all([
    fetch("assets/data/world.geo.json").then((r) => r.json()),
    fetch("assets/data/manifest.json").then((r) => r.json()),
  ]).then(([geo, manifest]) => {
    renderCountries(geo);
    renderMarkers(manifest.places);
    renderList(manifest.places);
    indexMarkers(manifest.places);
  }).catch((err) => {
    console.error("加载失败：", err);
  });
})();
