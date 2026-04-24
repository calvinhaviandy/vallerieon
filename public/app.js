const loveCanvas = document.getElementById("love-canvas");
const featuredMemory = document.getElementById("featured-memory");
const spotlightCard = document.getElementById("spotlight-card");
const heartCount = document.getElementById("heart-count");
const tileTemplate = document.getElementById("love-tile-template");
const spotlightTemplate = document.getElementById("spotlight-template");
const API_BASE = (window.GALLERY_API_BASE || "").replace(/\/$/, "");

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

function generateHeartPositions(total) {
  const heartRows = [
    { width: 0.48, y: 16, offset: 0.02 },
    { width: 0.72, y: 27, offset: 0.015 },
    { width: 0.92, y: 38, offset: 0.008 },
    { width: 1.02, y: 49, offset: 0 },
    { width: 0.82, y: 61, offset: 0.008 },
    { width: 0.64, y: 74, offset: 0.016 },
    { width: 0.46, y: 87, offset: 0.024 },
    { width: 0.28, y: 100, offset: 0.03 }
  ];

  const rowWeights = [4, 6, 8, 9, 6, 4, 3, 1];
  const totalWeight = rowWeights.reduce((sum, value) => sum + value, 0);
  const rowCounts = rowWeights.map((weight) => Math.max(1, Math.floor((total * weight) / totalWeight)));
  let assigned = rowCounts.reduce((sum, count) => sum + count, 0);

  while (assigned < total) {
    const targetRow = rowCounts.indexOf(Math.min(...rowCounts.slice(1, 6))) + 1;
    rowCounts[targetRow] += 1;
    assigned += 1;
  }

  while (assigned > total) {
    const targetRow = rowCounts.indexOf(Math.max(...rowCounts));
    if (rowCounts[targetRow] > 1) {
      rowCounts[targetRow] -= 1;
      assigned -= 1;
    } else {
      break;
    }
  }

  const positions = [];

  heartRows.forEach((row, rowIndex) => {
    const count = rowCounts[rowIndex];
    const usableWidth = row.width * 100;
    const startX = 50 - usableWidth / 2 + row.offset * 100;
    const endX = 50 + usableWidth / 2 + row.offset * 100;

    for (let index = 0; index < count; index += 1) {
      const progress = count === 1 ? 0.5 : index / Math.max(count - 1, 1);
      const x = startX + (endX - startX) * progress;
      const arcLift = Math.sin(progress * Math.PI) * (rowIndex < 4 ? 1.6 : 0.8);

      positions.push({
        x,
        y: row.y - arcLift,
        r: ((rowIndex + index) % 5) * 2.5 - 5
      });
    }
  });

  return positions.slice(0, total);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function createMedia(item, mode = "detail") {
  const mediaSource = item.url || `/uploads/${item.filename}`;

  if (item.type === "video") {
    const video = document.createElement("video");
    video.src = mediaSource;
    video.preload = "metadata";
    video.playsInline = true;
    if (mode === "tile") {
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
    } else {
      video.controls = true;
    }
    return video;
  }

  const image = document.createElement("img");
  image.src = mediaSource;
  image.alt = item.title;
  image.loading = "lazy";
  return image;
}

function renderFeatured(item) {
  featuredMemory.innerHTML = "";
  if (!item) return;

  const wrapper = document.createElement("div");
  wrapper.className = "featured-inner";

  const media = createMedia(item, "featured");
  media.classList.add("featured-media");

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = item.type === "video" ? "Featured video" : "Featured memory";

  const title = document.createElement("h3");
  title.textContent = item.title;

  const desc = document.createElement("p");
  desc.className = "hero-text";
  desc.textContent = item.description || "Momen manis yang selalu seru untuk diingat lagi.";

  wrapper.append(eyebrow, media, title, desc);
  featuredMemory.appendChild(wrapper);
}

function renderSpotlight(item) {
  spotlightCard.innerHTML = "";
  if (!item) {
    spotlightCard.innerHTML = `
      <article class="spotlight-empty">
        <p class="eyebrow">First mission</p>
        <h3>Heart ini menunggu foto pertama kalian.</h3>
        <p class="memory-description">Upload memori dari admin panel, lalu isi slot-slot kosongnya satu per satu.</p>
      </article>
    `;
    return;
  }

  const fragment = spotlightTemplate.content.cloneNode(true);
  const mediaShell = fragment.querySelector(".spotlight-media-shell");
  const typeLabel = fragment.querySelector(".memory-type");
  const dateLabel = fragment.querySelector(".memory-date");
  const title = fragment.querySelector(".memory-title");
  const description = fragment.querySelector(".memory-description");

  mediaShell.appendChild(createMedia(item, "detail"));
  typeLabel.textContent = item.type === "video" ? "Video" : "Photo";
  dateLabel.textContent = formatDate(item.createdAt);
  title.textContent = item.title;
  description.textContent = item.description || "Memori kecil yang tetap berarti.";

  spotlightCard.appendChild(fragment);
}

function activateTile(item, button) {
  loveCanvas.querySelectorAll(".love-tile").forEach((tile) => tile.classList.remove("is-active"));
  if (button) {
    button.classList.add("is-active");
  }
  renderSpotlight(item);
}

function createPlaceholder(position, index) {
  const placeholder = document.createElement("div");
  placeholder.className = "love-tile love-tile-empty";
  placeholder.style.left = `${position.x}%`;
  placeholder.style.top = `${position.y}%`;
  placeholder.style.rotate = `${position.r}deg`;
  placeholder.style.animationDelay = `${Math.min(index * 40, 900)}ms`;
  placeholder.innerHTML = `
    <span class="love-tile-placeholder">
      <span class="placeholder-heart"></span>
      <span class="placeholder-label">Empty Memory</span>
    </span>
  `;
  return placeholder;
}

function renderHeartWall(items, heartSlots) {
  const heartPositions = generateHeartPositions(heartSlots);
  loveCanvas.innerHTML = "";
  heartCount.textContent = `${items.length} / ${heartPositions.length} memories`;
  const widestRow = heartPositions.reduce((accumulator, position) => {
    const key = Math.round(position.y);
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
  const maxRowCount = Math.max(...Object.values(widestRow));
  const visualTileSize = 78 / Math.max(maxRowCount, 1);
  const tileSize = Math.max(8.8, Math.min(12.8, visualTileSize));
  loveCanvas.style.setProperty("--tile-size", `${tileSize}%`);

  heartPositions.forEach((position, index) => {
    const item = items[index];

    if (!item) {
      loveCanvas.appendChild(createPlaceholder(position, index));
      return;
    }

    const fragment = tileTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".love-tile");
    const mediaShell = fragment.querySelector(".love-tile-media");
    const title = fragment.querySelector(".love-tile-title");

    mediaShell.appendChild(createMedia(item, "tile"));
    title.textContent = item.title;
    button.style.left = `${position.x}%`;
    button.style.top = `${position.y}%`;
    button.style.rotate = `${position.r}deg`;
    button.style.animationDelay = `${Math.min(index * 70, 900)}ms`;
    button.setAttribute("aria-label", `Lihat detail ${item.title}`);

    button.addEventListener("mouseenter", () => activateTile(item, button));
    button.addEventListener("focus", () => activateTile(item, button));
    button.addEventListener("click", () => activateTile(item, button));

    loveCanvas.appendChild(button);
  });

  if (items[0]) {
    activateTile(items[0], loveCanvas.querySelector(".love-tile"));
  } else {
    renderSpotlight(null);
  }
}

async function loadGallery() {
  loveCanvas.innerHTML = "<p>Memuat kenangan...</p>";
  const [galleryResponse, configResponse] = await Promise.all([
    fetch(apiUrl("/api/gallery"), { credentials: "include" }),
    fetch(apiUrl("/api/site-config"), { credentials: "include" })
  ]);
  const items = await galleryResponse.json();
  const config = await configResponse.json();
  const featured = items.find((item) => item.featured) || items[0];

  renderFeatured(featured);
  renderHeartWall(items, config.heartSlots || 41);
}

loadGallery().catch(() => {
  loveCanvas.innerHTML = "<p>Galeri belum bisa dimuat sekarang.</p>";
});
