const memoryTrack = document.getElementById("memory-track");
const memoryGrid = document.getElementById("memory-grid");
const slideTemplate = document.getElementById("slide-template");
const gridTemplate = document.getElementById("grid-template");
const anniversaryCounter = document.getElementById("anniversary-counter");
const prevMemoryButton = document.getElementById("prev-memory");
const nextMemoryButton = document.getElementById("next-memory");
const playerPrevButton = document.getElementById("player-prev");
const playerNextButton = document.getElementById("player-next");
const playButton = document.getElementById("play-button");
const playerArt = document.getElementById("player-art");
const playerTitle = document.getElementById("player-title");
const playerSubtitle = document.getElementById("player-subtitle");
const progressFill = document.getElementById("progress-fill");
const memoryAudio = document.getElementById("memory-audio");
const memoryTitle = document.getElementById("memory-title");
const memoryDescription = document.getElementById("memory-description");
const memoryType = document.getElementById("memory-type");
const memoryDate = document.getElementById("memory-date");
const API_BASE = (window.GALLERY_API_BASE || "").replace(/\/$/, "");

let memories = [];
let activeIndex = 0;
let anniversaryTimer;
let audioContext;
let musicNodes = [];
let fallbackTimer;
let usingFallbackMusic = false;
let hasConfiguredMusicUrl = false;

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function getMemoryMedia(item) {
  if (Array.isArray(item.media) && item.media.length) {
    return item.media;
  }

  return [
    {
      type: item.type,
      filename: item.filename,
      url: item.url,
      storagePath: item.storagePath
    }
  ].filter((media) => media.url || media.filename);
}

function getCover(item) {
  return getMemoryMedia(item)[0] || item;
}

function getMediaSource(media) {
  return media.url || `/uploads/${media.filename}`;
}

function createMedia(media, title, mode = "slide") {
  const mediaSource = getMediaSource(media);

  if (media.type === "video") {
    const video = document.createElement("video");
    video.src = mediaSource;
    video.preload = "metadata";
    video.playsInline = true;
    video.muted = mode !== "detail";
    video.loop = mode !== "detail";
    if (mode !== "detail") {
      video.autoplay = true;
    } else {
      video.controls = true;
    }
    return video;
  }

  const image = document.createElement("img");
  image.src = mediaSource;
  image.alt = title;
  image.loading = "lazy";
  return image;
}

function renderAnniversaryCounter(settings) {
  if (!anniversaryCounter) return;

  const startDate = settings?.anniversaryDate;
  if (!startDate) {
    anniversaryCounter.hidden = true;
    anniversaryCounter.innerHTML = "";
    return;
  }

  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) {
    anniversaryCounter.hidden = true;
    return;
  }

  anniversaryCounter.hidden = false;

  const updateCountdown = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), start.getMonth(), start.getDate());

    if (next < now) {
      next.setFullYear(next.getFullYear() + 1);
    }

    const diff = Math.max(0, next - now);
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    const anniversaryYear = next.getFullYear() - start.getFullYear();

    anniversaryCounter.innerHTML = `
      <p class="anniversary-label">Menuju anniversary ${Math.max(anniversaryYear, 1)}</p>
      <div class="countdown-grid">
        <span><strong>${String(days).padStart(2, "0")}</strong><small>Hari</small></span>
        <span><strong>${String(hours).padStart(2, "0")}</strong><small>Jam</small></span>
        <span><strong>${String(minutes).padStart(2, "0")}</strong><small>Menit</small></span>
        <span><strong>${String(seconds).padStart(2, "0")}</strong><small>Detik</small></span>
      </div>
    `;
  };

  clearInterval(anniversaryTimer);
  updateCountdown();
  anniversaryTimer = setInterval(updateCountdown, 1000);
}

function updateActiveMemory() {
  if (!memories.length) return;

  const active = memories[activeIndex];
  const cover = getCover(active);
  const coverSource = getMediaSource(cover);

  document.querySelectorAll(".memory-slide").forEach((slide, index) => {
    const offset = index - activeIndex;
    const isActive = index === activeIndex;
    const isNear = Math.abs(offset) === 1;

    slide.style.setProperty("--slide-x", `${offset * 54}%`);
    slide.style.setProperty("--slide-scale", isActive ? "1" : "0.78");
    slide.style.setProperty("--slide-rotate", `${offset * -12}deg`);
    slide.classList.toggle("is-active", isActive);
    slide.classList.toggle("is-near", isNear);
  });

  playerArt.src = coverSource;
  playerArt.alt = active.title;
  if (!playerTitle.dataset.customMusicTitle) {
    playerTitle.textContent = active.title;
  }
  playerSubtitle.textContent = active.description || "Gallery of Us";
  memoryTitle.textContent = active.title;
  memoryDescription.textContent = active.description || "Memori kecil yang tetap berarti.";
  memoryType.textContent = active.type === "video" ? "Video" : "Photo";
  memoryDate.textContent = formatDate(active.createdAt);
}

function moveCarousel(direction) {
  if (!memories.length) return;
  activeIndex = (activeIndex + direction + memories.length) % memories.length;
  updateActiveMemory();
}

function renderCarousel(items) {
  memoryTrack.innerHTML = "";

  if (!items.length) {
    memoryTrack.innerHTML = `
      <article class="empty-state">
        <h2>Belum ada memori.</h2>
        <p>Upload foto atau video dari panel admin, lalu carousel ini akan langsung terisi.</p>
      </article>
    `;
    memoryTitle.textContent = "Belum ada memori";
    memoryDescription.textContent = "Carousel akan hidup setelah kamu upload foto pertama.";
    return;
  }

  items.forEach((item, index) => {
    const fragment = slideTemplate.content.cloneNode(true);
    const slide = fragment.querySelector(".memory-slide");
    const mediaShell = fragment.querySelector(".slide-media");
    const slideNumber = fragment.querySelector(".slide-number");
    const slideTitle = fragment.querySelector(".slide-title");
    const cover = getCover(item);

    slide.setAttribute("aria-label", item.title);
    mediaShell.appendChild(createMedia(cover, item.title));
    slideNumber.textContent = String(index + 1).padStart(2, "0");
    slideTitle.textContent = item.title;
    slide.addEventListener("click", () => {
      activeIndex = index;
      updateActiveMemory();
    });

    memoryTrack.appendChild(fragment);
  });

  updateActiveMemory();
}

async function openAdminFromShortcut() {
  try {
    await fetch(apiUrl("/api/admin/shortcut"), {
      method: "POST",
      credentials: "include"
    });
    window.location.href = "/admin.html";
  } catch (error) {
    window.location.href = "/";
  }
}

function renderMemoryGrid(items) {
  memoryGrid.innerHTML = "";

  if (!items.length) {
    memoryGrid.innerHTML = "<p class=\"gallery-summary\">Belum ada arsip memori.</p>";
    return;
  }

  items.forEach((item) => {
    const fragment = gridTemplate.content.cloneNode(true);
    const mediaShell = fragment.querySelector(".media-shell");
    const type = fragment.querySelector(".grid-type");
    const date = fragment.querySelector(".grid-date");
    const title = fragment.querySelector(".grid-title");
    const description = fragment.querySelector(".grid-description");
    const cover = getCover(item);

    mediaShell.appendChild(createMedia(cover, item.title));
    type.textContent = item.type === "video" ? "Video" : "Photo";
    date.textContent = formatDate(item.createdAt);
    title.textContent = item.title;
    description.textContent = item.description || "Memori kecil yang tetap berarti.";

    memoryGrid.appendChild(fragment);
  });
}

function startFallbackMusic() {
  audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
  usingFallbackMusic = true;

  const playChord = () => {
    const now = audioContext.currentTime;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
    gain.connect(audioContext.destination);

    [261.63, 329.63, 392, 523.25].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(now + index * 0.08);
      oscillator.stop(now + 2.8);
      musicNodes.push(oscillator);
    });

    musicNodes.push(gain);
  };

  playChord();
  fallbackTimer = setInterval(playChord, 2800);
}

function stopFallbackMusic() {
  clearInterval(fallbackTimer);
  musicNodes.forEach((node) => {
    try {
      node.stop?.();
      node.disconnect?.();
    } catch (error) {
      node.disconnect?.();
    }
  });
  musicNodes = [];
  usingFallbackMusic = false;
}

async function toggleMusic() {
  if (usingFallbackMusic || !memoryAudio.paused) {
    memoryAudio.pause();
    stopFallbackMusic();
    playButton.classList.remove("is-playing");
    playButton.setAttribute("aria-label", "Putar musik");
    return;
  }

  try {
    await memoryAudio.play();
  } catch (error) {
    if (hasConfiguredMusicUrl) {
      playerSubtitle.textContent = "URL musik tidak bisa diputar. Pakai direct MP3/M4A/OGG/WAV atau upload file musik.";
      playButton.classList.remove("is-playing");
      playButton.setAttribute("aria-label", "Putar musik");
      return;
    }

    startFallbackMusic();
  }

  playButton.classList.add("is-playing");
  playButton.setAttribute("aria-label", "Jeda musik");
}

function updateProgress() {
  if (memoryAudio.duration) {
    progressFill.style.width = `${(memoryAudio.currentTime / memoryAudio.duration) * 100}%`;
    return;
  }

  const width = Number.parseFloat(progressFill.style.width || "0");
  progressFill.style.width = `${(width + 0.22) % 100}%`;
  requestAnimationFrame(updateProgress);
}

async function loadGallery() {
  memoryTrack.innerHTML = "<p class=\"gallery-summary\">Memuat kenangan...</p>";
  const [galleryResponse, configResponse] = await Promise.all([
    fetch(apiUrl("/api/gallery"), { credentials: "include" }),
    fetch(apiUrl("/api/site-config"), { credentials: "include" })
  ]);

  memories = await galleryResponse.json();
  const config = await configResponse.json();
  const featured = memories.findIndex((item) => item.featured);
  activeIndex = featured >= 0 ? featured : 0;

  renderAnniversaryCounter(config);
  renderMusicSettings(config);
  renderCarousel(memories);
  renderMemoryGrid(memories);
}

function renderMusicSettings(config) {
  hasConfiguredMusicUrl = Boolean(config?.musicUrl);
  const configuredMusicUrl = config?.musicUrl || "/music/our-song.mp3";
  const configuredMusicTitle = config?.musicTitle || "";

  if (configuredMusicUrl) {
    memoryAudio.src = configuredMusicUrl;
    memoryAudio.load();
  }

  if (configuredMusicTitle) {
    playerTitle.textContent = configuredMusicTitle;
    playerTitle.dataset.customMusicTitle = "true";
  } else {
    delete playerTitle.dataset.customMusicTitle;
  }
}

prevMemoryButton.addEventListener("click", () => moveCarousel(-1));
nextMemoryButton.addEventListener("click", () => moveCarousel(1));
playerPrevButton.addEventListener("click", () => moveCarousel(-1));
playerNextButton.addEventListener("click", () => moveCarousel(1));
playButton.addEventListener("click", toggleMusic);
memoryAudio.addEventListener("timeupdate", updateProgress);
memoryAudio.addEventListener("ended", () => {
  playButton.classList.remove("is-playing");
  progressFill.style.width = "0%";
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "r") {
    event.preventDefault();
    openAdminFromShortcut();
    return;
  }

  if (event.key === "ArrowLeft") moveCarousel(-1);
  if (event.key === "ArrowRight") moveCarousel(1);
  if (event.key === " " && event.target === document.body) {
    event.preventDefault();
    toggleMusic();
  }
});

updateProgress();
loadGallery().catch(() => {
  memoryTrack.innerHTML = "<p class=\"gallery-summary\">Galeri belum bisa dimuat sekarang.</p>";
});
