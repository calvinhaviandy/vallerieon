export const MAX_FILE_COUNT = 12;
export const MAX_REQUEST_FILE_BYTES = 3 * 1024 * 1024;
const IMAGE_OPTIMIZE_THRESHOLD = 650 * 1024;

export function formatDate(value, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tanggal tidak tersedia";

  return date.toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {})
  });
}

export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round((Number(milliseconds) || 0) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatPlaybackTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function getMemoryMedia(item) {
  const media = Array.isArray(item?.media) && item.media.length
    ? item.media
    : [{
        type: item?.type,
        filename: item?.filename,
        url: item?.url,
        storagePath: item?.storagePath
      }];

  return media.filter((entry) => entry && (entry.url || entry.filename || entry.storagePath));
}

export function getMediaSource(media) {
  if (media?.url) return media.url;
  if (!media?.filename) return "";
  const filename = media.filename.split("/").map(encodeURIComponent).join("/");
  return `/uploads/${filename}`;
}

export function flattenMemories(items) {
  return items.flatMap((entry) => {
    const mediaItems = getMemoryMedia(entry);
    if (!mediaItems.length) {
      return [{ entry, media: null, mediaIndex: 0, mediaCount: 0 }];
    }
    return mediaItems.map((media, mediaIndex) => ({
      entry,
      media,
      mediaIndex,
      mediaCount: mediaItems.length
    }));
  });
}

export function isDirectAudioUrl(value) {
  if (!value || !/^https?:\/\/.+|^\/.+/.test(value)) return false;

  try {
    const parsed = new URL(value, window.location.origin);
    const pathname = parsed.pathname.toLowerCase();
    return (pathname === "/api/blob" && parsed.searchParams.has("path")) ||
      pathname.startsWith("/uploads/") ||
      /\.(mp3|m4a|ogg|wav)$/.test(pathname);
  } catch {
    return false;
  }
}

export function getActiveMusicSource(settings) {
  if (settings?.musicSource === "spotify" && settings.spotifyTrack?.id) return "spotify";
  if (settings?.musicSource === "audio" && settings.musicUrl) return "audio";
  if (settings?.spotifyTrack?.id && !settings.musicUrl) return "spotify";
  if (settings?.musicUrl) return "audio";
  return "none";
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("File gagal dibaca."));
    reader.readAsDataURL(file);
  });
}

async function optimizeImage(file, force = false) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || (!force && file.size <= IMAGE_OPTIMIZE_THRESHOLD)) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", {
      type: "image/webp",
      lastModified: file.lastModified
    });
  } catch {
    return file;
  }
}

export async function prepareFiles(files) {
  if (files.length > MAX_FILE_COUNT) {
    throw new Error(`Maksimal ${MAX_FILE_COUNT} file untuk satu memori.`);
  }

  const originalTotal = files.reduce((total, file) => total + file.size, 0);
  const prepared = await Promise.all(
    files.map((file) => optimizeImage(file, originalTotal > MAX_REQUEST_FILE_BYTES))
  );
  const totalBytes = prepared.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_REQUEST_FILE_BYTES) {
    throw new Error(
      `Total file setelah kompresi masih ${formatSize(totalBytes)}. Maksimal ${formatSize(MAX_REQUEST_FILE_BYTES)} per upload.`
    );
  }

  return prepared;
}
