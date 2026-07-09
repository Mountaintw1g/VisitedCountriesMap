(function () {
  "use strict";

  const STORAGE_KEY = "visitedCountries";
  const MAP_WIDTH = 960;
  const MAP_HEIGHT = 520;

  const svg = document.getElementById("map");
  const tooltip = document.getElementById("tooltip");
  const mapFrame = document.querySelector(".map-frame");
  const searchInput = document.getElementById("searchInput");
  const countryListEl = document.getElementById("countryList");
  const chipsEl = document.getElementById("countryChips");
  const emptyStateEl = document.getElementById("emptyState");
  const listCountEl = document.getElementById("listCount");
  const statCountEl = document.getElementById("statCount");
  const statPercentEl = document.getElementById("statPercent");
  const btnExport = document.getElementById("btnExport");
  const btnPrint = document.getElementById("btnPrint");
  const btnClear = document.getElementById("btnClear");

  let features = [];
  let idToFeature = new Map();
  let visited = loadVisited();

  function loadVisited() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) {
      return new Set();
    }
  }

  function saveVisited() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(visited)));
  }

  function countryName(feature) {
    return feature.properties.name;
  }

  fetch("data/countries-50m.json")
    .then((res) => res.json())
    .then((topology) => {
      const geo = topojson.feature(topology, topology.objects.countries);
      features = geo.features
        .filter((f) => countryName(f) !== "Antarctica")
        .sort((a, b) => countryName(a).localeCompare(countryName(b)));

      const projection = d3.geoNaturalEarth1().fitSize([MAP_WIDTH, MAP_HEIGHT], geo);
      const path = d3.geoPath(projection);

      const svgSel = d3.select(svg).attr("viewBox", `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`);

      svgSel
        .selectAll("path.country")
        .data(features)
        .enter()
        .append("path")
        .attr("class", "country")
        .attr("d", path)
        .attr("data-id", (d) => d.id)
        .attr("data-name", (d) => countryName(d))
        .on("click", (event, d) => toggleVisited(d.id))
        .on("mousemove", (event, d) => showTooltip(event, d))
        .on("mouseleave", hideTooltip);

      idToFeature = new Map(features.map((f) => [f.id, f]));

      countryListEl.innerHTML = features
        .map((f) => `<option value="${escapeHtml(countryName(f))}"></option>`)
        .join("");

      applyVisitedClasses();
      renderList();
      renderStats();
    })
    .catch((err) => {
      mapFrame.innerHTML =
        '<p style="padding:24px;color:#b23">Could not load map data. Check your internet connection and reload.</p>';
      console.error(err);
    });

  function toggleVisited(id) {
    if (visited.has(id)) {
      visited.delete(id);
    } else {
      visited.add(id);
    }
    saveVisited();
    applyVisitedClasses();
    renderList();
    renderStats();
  }

  function applyVisitedClasses() {
    d3.select(svg)
      .selectAll("path.country")
      .classed("visited", (d) => visited.has(d.id));
  }

  function showTooltip(event, d) {
    const rect = mapFrame.getBoundingClientRect();
    tooltip.textContent = countryName(d);
    tooltip.style.left = event.clientX - rect.left + "px";
    tooltip.style.top = event.clientY - rect.top + "px";
    tooltip.classList.add("visible");
  }

  function hideTooltip() {
    tooltip.classList.remove("visible");
  }

  function renderStats() {
    const total = features.length;
    const count = visited.size;
    statCountEl.textContent = count;
    statPercentEl.textContent = total ? ((count / total) * 100).toFixed(2) + "%" : "0.00%";
  }

  function renderList() {
    const visitedFeatures = features.filter((f) => visited.has(f.id));
    listCountEl.textContent = visitedFeatures.length;
    emptyStateEl.style.display = visitedFeatures.length ? "none" : "block";
    chipsEl.innerHTML = visitedFeatures
      .map(
        (f) => `
      <li class="chip" data-id="${f.id}">
        ${escapeHtml(countryName(f))}
        <button type="button" aria-label="Remove ${escapeHtml(countryName(f))}" data-remove="${f.id}">×</button>
      </li>`
      )
      .join("");
  }

  chipsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-remove]");
    if (!btn) return;
    toggleVisited(btn.dataset.remove);
  });

  function findFeatureByName(name) {
    const target = name.trim().toLowerCase();
    if (!target) return null;
    return (
      features.find((f) => countryName(f).toLowerCase() === target) ||
      features.find((f) => countryName(f).toLowerCase().startsWith(target))
    );
  }

  function flashCountry(id) {
    const el = svg.querySelector(`path[data-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView && el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 500);
  }

  searchInput.addEventListener("change", () => {
    const feature = findFeatureByName(searchInput.value);
    if (feature) {
      toggleVisited(feature.id);
      flashCountry(feature.id);
    }
    searchInput.value = "";
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const feature = findFeatureByName(searchInput.value);
      if (feature) {
        toggleVisited(feature.id);
        flashCountry(feature.id);
      }
      searchInput.value = "";
      searchInput.blur();
    }
  });

  btnClear.addEventListener("click", () => {
    if (!visited.size) return;
    if (!confirm("Clear your entire visited-countries list? This cannot be undone.")) return;
    visited.clear();
    saveVisited();
    applyVisitedClasses();
    renderList();
    renderStats();
  });

  btnPrint.addEventListener("click", () => window.print());

  btnExport.addEventListener("click", exportAsImage);

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function exportAsImage() {
    const scale = 2;
    const padding = 40;
    const titleHeight = 74;
    const listMaxHeight = 140;

    const clone = svg.cloneNode(true);
    const originalPaths = svg.querySelectorAll("path.country");
    const clonedPaths = clone.querySelectorAll("path.country");
    originalPaths.forEach((orig, i) => {
      const computed = getComputedStyle(orig);
      clonedPaths[i].setAttribute("fill", computed.fill);
      clonedPaths[i].setAttribute("stroke", computed.stroke);
      clonedPaths[i].setAttribute("stroke-width", computed.strokeWidth);
    });
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", MAP_WIDTH);
    clone.setAttribute("height", MAP_HEIGHT);

    const svgString = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const visitedFeatures = features.filter((f) => visited.has(f.id));
      const listText = visitedFeatures.map((f) => countryName(f)).join("   •   ");

      const canvas = document.createElement("canvas");
      const mapAreaHeight = MAP_HEIGHT * scale;
      const listHeight = listText ? listMaxHeight : 40;
      canvas.width = (MAP_WIDTH + padding * 2) * scale;
      canvas.height = (titleHeight + MAP_HEIGHT + padding * 2) * scale + listHeight;
      const ctx = canvas.getContext("2d");

      // background
      const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bg.addColorStop(0, "#f4f6f8");
      bg.addColorStop(1, "#e9edf1");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // title
      ctx.fillStyle = "#1c2430";
      ctx.font = `700 ${26 * scale}px Inter, -apple-system, Segoe UI, Roboto, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("My Travel Map", canvas.width / 2, 34 * scale);

      ctx.fillStyle = "#6b7684";
      ctx.font = `600 ${14 * scale}px Inter, -apple-system, Segoe UI, Roboto, sans-serif`;
      const percent = features.length ? ((visitedFeatures.length / features.length) * 100).toFixed(2) : "0.00";
      ctx.fillText(
        `${visitedFeatures.length} countries visited (${percent}% of the world)`,
        canvas.width / 2,
        58 * scale
      );

      // ocean background behind map
      const mapX = padding * scale;
      const mapY = titleHeight * scale;
      const ocean = ctx.createLinearGradient(mapX, mapY, mapX, mapY + mapAreaHeight);
      ocean.addColorStop(0, "#dff1f7");
      ocean.addColorStop(1, "#c6e6f2");
      ctx.fillStyle = ocean;
      roundRect(ctx, mapX, mapY, MAP_WIDTH * scale, mapAreaHeight, 10 * scale);
      ctx.fill();

      ctx.drawImage(img, mapX, mapY, MAP_WIDTH * scale, mapAreaHeight);

      // country list
      if (listText) {
        ctx.fillStyle = "#1c2430";
        ctx.font = `${13 * scale}px Inter, -apple-system, Segoe UI, Roboto, sans-serif`;
        ctx.textAlign = "left";
        wrapText(
          ctx,
          listText,
          mapX,
          mapY + mapAreaHeight + 26 * scale,
          MAP_WIDTH * scale,
          18 * scale,
          Math.floor((listHeight - 20 * scale) / (18 * scale))
        );
      }

      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "my-travel-map.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert("Sorry, the export failed. Try again after the map has fully loaded.");
    };
    img.src = url;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = text.split(" ");
    let line = "";
    let lines = 0;
    let cursorY = y;
    for (let i = 0; i < words.length; i++) {
      const test = line + words[i] + " ";
      if (ctx.measureText(test).width > maxWidth && line) {
        if (lines >= maxLines - 1) {
          ctx.fillText(line.trim() + " …", x, cursorY);
          return;
        }
        ctx.fillText(line, x, cursorY);
        line = words[i] + " ";
        cursorY += lineHeight;
        lines++;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cursorY);
  }
})();
