const loginCard = document.getElementById("login-card");
const adminPanel = document.getElementById("admin-panel");
const loginForm = document.getElementById("login-form");
const settingsForm = document.getElementById("settings-form");
const uploadForm = document.getElementById("upload-form");
const loginMessage = document.getElementById("login-message");
const settingsMessage = document.getElementById("settings-message");
const uploadMessage = document.getElementById("upload-message");
const adminGallery = document.getElementById("admin-gallery");
const logoutButton = document.getElementById("logout-button");
const adminTemplate = document.getElementById("admin-item-template");
const editingIdInput = document.getElementById("editing-id");
const submitMemoryButton = document.getElementById("submit-memory");
const cancelEditButton = document.getElementById("cancel-edit");
const fileInput = document.getElementById("file");
const heartSlotsInput = document.getElementById("heart-slots");
const anniversaryDateInput = document.getElementById("anniversary-date");
const musicTitleInput = document.getElementById("music-title");
const musicUrlInput = document.getElementById("music-url");
const musicFileInput = document.getElementById("music-file");
const currentMusic = document.getElementById("current-music");
const API_BASE = (window.GALLERY_API_BASE || "").replace(/\/$/, "");

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

function formatDate(value) {
  return new Date(value).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function createPreview(item) {
  const firstMedia = getMemoryMedia(item)[0] || item;
  const mediaSource = firstMedia.url || `/uploads/${firstMedia.filename}`;

  if (firstMedia.type === "video") {
    const video = document.createElement("video");
    video.src = mediaSource;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    return video;
  }

  const image = document.createElement("img");
  image.src = mediaSource;
  image.alt = item.title;
  return image;
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

async function request(url, options = {}) {
  const response = await fetch(apiUrl(url), {
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    ...options
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Terjadi kesalahan.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function showPanel(authenticated) {
  loginCard.classList.toggle("hidden", authenticated);
  adminPanel.classList.toggle("hidden", !authenticated);
}

function handleAdminError(error, targetMessage = uploadMessage) {
  if (error.status === 401) {
    resetUploadForm();
    showPanel(false);
    loginMessage.textContent = "Session admin habis. Login ulang dulu ya.";
    return;
  }

  targetMessage.textContent = error.message;
}

function resetUploadForm() {
  uploadForm.reset();
  editingIdInput.value = "";
  fileInput.required = true;
  submitMemoryButton.textContent = "Upload sekarang";
  cancelEditButton.classList.add("hidden");
}

function setEditMode(item) {
  editingIdInput.value = item.id;
  document.getElementById("title").value = item.title;
  document.getElementById("description").value = item.description || "";
  document.getElementById("featured").checked = Boolean(item.featured);
  fileInput.required = false;
  submitMemoryButton.textContent = "Simpan perubahan";
  cancelEditButton.classList.remove("hidden");
  uploadMessage.textContent = "Mode edit aktif. File baru tidak wajib dipilih.";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadSettings() {
  const settings = await request("/api/site-config", { method: "GET" });
  heartSlotsInput.value = settings.heartSlots || 41;
  anniversaryDateInput.value = settings.anniversaryDate || "";
  musicTitleInput.value = settings.musicTitle || "";
  musicUrlInput.value = settings.musicUrl || "";
  renderCurrentMusic(settings);
}

function renderCurrentMusic(settings) {
  const musicUrl = settings.musicUrl || "";
  const musicTitle = settings.musicTitle || "Belum ada judul musik";

  currentMusic.classList.toggle("is-visible", Boolean(musicUrl));
  currentMusic.innerHTML = musicUrl
    ? `<strong>Musik aktif:</strong> ${musicTitle}<br>${musicUrl}`
    : "";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("File gagal dibaca."));
    reader.readAsDataURL(file);
  });
}

async function loadAdminGallery() {
  const items = await request("/api/gallery", { method: "GET" });
  adminGallery.innerHTML = "";

  if (!items.length) {
    adminGallery.innerHTML = "<p>Belum ada memori tersimpan.</p>";
    return;
  }

  items.forEach((item) => {
    const fragment = adminTemplate.content.cloneNode(true);
    const wrapper = fragment.querySelector(".admin-memory-item");
    const preview = fragment.querySelector(".admin-memory-preview");
    const title = fragment.querySelector(".admin-memory-title");
    const description = fragment.querySelector(".admin-memory-description");
    const meta = fragment.querySelector(".admin-memory-meta");
    const editButton = fragment.querySelector(".edit-button");
    const deleteButton = fragment.querySelector(".delete-button");

    preview.appendChild(createPreview(item));
    title.textContent = item.title;
    description.textContent = item.description || "Tanpa deskripsi";
    const mediaCount = getMemoryMedia(item).length;
    const typeLabel = item.type === "video" ? "Video" : "Foto";
    meta.textContent = `${typeLabel} - ${mediaCount} file - ${formatDate(item.createdAt)}`;

    editButton.addEventListener("click", () => {
      setEditMode(item);
    });

    deleteButton.addEventListener("click", async () => {
      const confirmed = window.confirm(`Hapus "${item.title}" dari galeri?`);
      if (!confirmed) return;

      try {
        await request(`/api/admin/media?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
        await loadAdminGallery();
      } catch (error) {
        handleAdminError(error, uploadMessage);
      }
    });

    adminGallery.appendChild(wrapper);
  });
}

async function checkSession() {
  const data = await request("/api/admin/session", { method: "GET" });
  showPanel(data.authenticated);
  if (data.authenticated) {
    await Promise.all([loadAdminGallery(), loadSettings()]);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "Memeriksa password...";

  try {
    const password = document.getElementById("password").value;
    await request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password })
    });
    loginForm.reset();
    loginMessage.textContent = "";
    showPanel(true);
    await Promise.all([loadAdminGallery(), loadSettings()]);
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  settingsMessage.textContent = "Menyimpan setting...";

  try {
    const musicFile = musicFileInput.files[0]
      ? {
          originalName: musicFileInput.files[0].name,
          mimeType: musicFileInput.files[0].type,
          fileData: await readFileAsDataUrl(musicFileInput.files[0])
        }
      : null;

    const savedSettings = await request("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify({
        heartSlots: Number(heartSlotsInput.value),
        anniversaryDate: anniversaryDateInput.value,
        musicTitle: musicTitleInput.value,
        musicUrl: musicUrlInput.value,
        musicFile
      })
    });
    anniversaryDateInput.value = savedSettings.anniversaryDate || "";
    musicTitleInput.value = savedSettings.musicTitle || "";
    musicUrlInput.value = savedSettings.musicUrl || "";
    musicFileInput.value = "";
    renderCurrentMusic(savedSettings);
    settingsMessage.textContent = "Setting halaman utama berhasil diperbarui.";
  } catch (error) {
    handleAdminError(error, settingsMessage);
  }
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const editingId = editingIdInput.value;
  uploadMessage.textContent = editingId ? "Menyimpan perubahan..." : "Mengunggah memori...";

  const files = Array.from(fileInput.files);
  if (!editingId && !files.length) {
    uploadMessage.textContent = "Pilih minimal satu file terlebih dahulu.";
    return;
  }

  try {
    if (editingId) {
      await request(`/api/admin/media?id=${encodeURIComponent(editingId)}`, {
        method: "PUT",
        body: JSON.stringify({
          title: document.getElementById("title").value,
          description: document.getElementById("description").value,
          featured: document.getElementById("featured").checked
        })
      });
    } else {
      const mediaFiles = await Promise.all(
        files.map(async (file) => {
          const fileData = await readFileAsDataUrl(file);

          return {
            originalName: file.name,
            mimeType: file.type,
            fileData
          };
        })
      );

      await request("/api/admin/upload", {
        method: "POST",
        body: JSON.stringify({
          title: document.getElementById("title").value,
          description: document.getElementById("description").value,
          featured: document.getElementById("featured").checked,
          files: mediaFiles
        })
      });
    }

    resetUploadForm();
    uploadMessage.textContent = editingId
      ? "Memori berhasil diperbarui."
      : "Memori berhasil diunggah.";
    await loadAdminGallery();
  } catch (error) {
    handleAdminError(error, uploadMessage);
  }
});

cancelEditButton.addEventListener("click", () => {
  resetUploadForm();
  uploadMessage.textContent = "";
});

logoutButton.addEventListener("click", async () => {
  await request("/api/admin/logout", { method: "POST", body: JSON.stringify({}) });
  resetUploadForm();
  showPanel(false);
});

resetUploadForm();

checkSession().catch(() => {
  loginMessage.textContent = "Panel admin belum bisa dimuat.";
});
