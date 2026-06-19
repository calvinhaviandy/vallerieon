const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "galleryofus";
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || ADMIN_PASSWORD;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const BLOB_STORE_ID = normalizeEnvValue(process.env.BLOB_STORE_ID);
const BLOB_READ_WRITE_TOKEN = normalizeEnvValue(process.env.BLOB_READ_WRITE_TOKEN);
const GOOGLE_CONFIG_STATUS = {
  bucket: Boolean(process.env.GCS_BUCKET_NAME),
  projectId: Boolean(process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT),
  clientEmail: Boolean(process.env.GCP_CLIENT_EMAIL),
  privateKey: Boolean(process.env.GCP_PRIVATE_KEY),
  firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || "(default)"
};
const VERCEL_BLOB_CONFIG_STATUS = {
  storeId: Boolean(BLOB_STORE_ID),
  token: Boolean(BLOB_READ_WRITE_TOKEN)
};
const USE_VERCEL_BLOB = VERCEL_BLOB_CONFIG_STATUS.token;
const USE_GOOGLE_CLOUD =
  !USE_VERCEL_BLOB &&
  GOOGLE_CONFIG_STATUS.bucket &&
  GOOGLE_CONFIG_STATUS.projectId &&
  GOOGLE_CONFIG_STATUS.clientEmail &&
  GOOGLE_CONFIG_STATUS.privateKey;
const RAW_FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const FRONTEND_ORIGINS = RAW_FRONTEND_ORIGINS.flatMap((origin) => {
  if (origin === "*") {
    return [origin];
  }

  const normalized = origin.replace(/\/$/, "");
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return [normalized];
  }

  return [`https://${normalized}`, `http://${normalized}`];
});
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || "Lax";
const COOKIE_SECURE = IS_PRODUCTION || COOKIE_SAMESITE.toLowerCase() === "none";

const PUBLIC_DIR = path.join(__dirname, "public");
const PROTECTED_DIR = path.join(__dirname, "protected");
const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");
const DATA_DIR = path.join(__dirname, "data");
const GALLERY_FILE = path.join(DATA_DIR, "gallery.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const BLOB_DATA_PREFIX = process.env.BLOB_DATA_PREFIX || "data";
const BLOB_UPLOAD_PREFIX = process.env.BLOB_UPLOAD_PREFIX || "uploads";
const BLOB_GALLERY_PATH = `${BLOB_DATA_PREFIX}/gallery.json`;
const BLOB_SETTINGS_PATH = `${BLOB_DATA_PREFIX}/settings.json`;
const DEFAULT_SETTINGS = {
  heartSlots: 41,
  anniversaryDate: "",
  musicTitle: "Our favorite song",
  musicUrl: "",
  musicFilename: "",
  musicStoragePath: ""
};

let storageClientPromise;
let firestoreClientPromise;
let vercelBlobClientPromise;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ico": "image/x-icon"
};

ensureLocalStorage();

function ensureLocalStorage() {
  if (USE_VERCEL_BLOB || USE_GOOGLE_CLOUD) {
    return;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  if (!fs.existsSync(GALLERY_FILE)) {
    fs.writeFileSync(GALLERY_FILE, "[]", "utf8");
  }

  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf8");
  }
}

function readLocalGallery() {
  return JSON.parse(fs.readFileSync(GALLERY_FILE, "utf8"));
}

function readLocalSettings() {
  return {
    ...DEFAULT_SETTINGS,
    ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"))
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}

function getAllowedOrigin(req) {
  const origin = req.headers.origin?.replace(/\/$/, "");
  if (!origin) {
    return "";
  }

  if (FRONTEND_ORIGINS.includes("*") || FRONTEND_ORIGINS.includes(origin)) {
    return origin;
  }

  if (!IS_PRODUCTION && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    return origin;
  }

  return "";
}

function applyCors(req, res) {
  const allowedOrigin = getAllowedOrigin(req);
  if (!allowedOrigin) {
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

function getSessionCookieParts(value, maxAge) {
  const cookieParts = [
    `session=${value}`,
    "HttpOnly",
    "Path=/",
    `SameSite=${COOKIE_SAMESITE}`,
    `Max-Age=${maxAge}`
  ];

  if (COOKIE_SECURE) {
    cookieParts.push("Secure");
  }

  return cookieParts;
}

function getAdminEntryCookieParts(value, maxAge) {
  const cookieParts = [
    `admin_entry=${value}`,
    "HttpOnly",
    "Path=/",
    `SameSite=${COOKIE_SAMESITE}`,
    `Max-Age=${maxAge}`
  ];

  if (COOKIE_SECURE) {
    cookieParts.push("Secure");
  }

  return cookieParts;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf("=");
        return [cookie.slice(0, index), decodeURIComponent(cookie.slice(index + 1))];
      })
  );
}

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function signSession(payload) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
}

function createSessionToken() {
  const payload = toBase64Url(
    JSON.stringify({
      exp: Date.now() + 1000 * 60 * 60 * 24 * 14
    })
  );
  return `${payload}.${signSession(payload)}`;
}

function createAdminEntryToken() {
  const payload = toBase64Url(
    JSON.stringify({
      purpose: "admin-entry",
      exp: Date.now() + 1000 * 60 * 5
    })
  );
  return `${payload}.${signSession(payload)}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes(".")) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (signature !== signSession(payload)) {
    return false;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payload));
    return typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

function verifyAdminEntryToken(token) {
  if (!token || !token.includes(".")) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (signature !== signSession(payload)) {
    return false;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payload));
    return parsed.purpose === "admin-entry" && typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies.session);
}

function hasAdminEntry(req) {
  const cookies = parseCookies(req);
  return verifyAdminEntryToken(cookies.admin_entry);
}

function getGoogleClientOptions() {
  const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const clientEmail = process.env.GCP_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.GCP_PRIVATE_KEY);
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  const options = {
    ...(projectId ? { projectId } : {}),
    ...(databaseId ? { databaseId } : {})
  };

  if (clientEmail && privateKey) {
    return {
      ...options,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey
      }
    };
  }

  return options;
}

function normalizePrivateKey(value) {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n");
}

function normalizeEnvValue(value) {
  return (value || "").trim().replace(/^["']|["']$/g, "");
}

function serializeError(error) {
  const message = error?.message || "Unknown error";
  return {
    name: error?.name || "Error",
    code: error?.code || error?.status || "",
    message,
    hint:
      message.toLowerCase().includes("blob") || message.toLowerCase().includes("token")
        ? "Cek env Vercel BLOB_READ_WRITE_TOKEN dan BLOB_STORE_ID. Isi value tanpa tanda kutip."
        : error?.code === 5 || message.includes("NOT_FOUND")
          ? "Firestore database tidak ditemukan. Buat Firestore database di Google Cloud, atau isi FIRESTORE_DATABASE_ID kalau database ID kamu bukan (default)."
          : undefined
  };
}

function getStorageBackend() {
  if (USE_VERCEL_BLOB) return "vercel-blob";
  if (USE_GOOGLE_CLOUD) return "google-cloud";
  return "local";
}

function getBlobProxyUrl(storagePath) {
  return `/api/blob?path=${encodeURIComponent(storagePath)}`;
}

function normalizeBlobMediaUrl(media) {
  if (!USE_VERCEL_BLOB || !media?.storagePath) {
    return media;
  }

  return {
    ...media,
    url: getBlobProxyUrl(media.storagePath)
  };
}

function normalizeBlobGallery(items) {
  if (!USE_VERCEL_BLOB) {
    return items;
  }

  return items.map((item) => {
    const media = Array.isArray(item.media)
      ? item.media.map(normalizeBlobMediaUrl)
      : item.media;
    const normalizedItem = normalizeBlobMediaUrl(item);
    return {
      ...normalizedItem,
      media
    };
  });
}

function normalizeBlobSettings(settings) {
  if (!USE_VERCEL_BLOB || !settings.musicStoragePath) {
    return settings;
  }

  return {
    ...settings,
    musicUrl: getBlobProxyUrl(settings.musicStoragePath)
  };
}

async function getStorageClient() {
  if (!storageClientPromise) {
    storageClientPromise = import("@google-cloud/storage").then(({ Storage }) => {
      return new Storage(getGoogleClientOptions());
    });
  }
  return storageClientPromise;
}

async function getFirestoreClient() {
  if (!firestoreClientPromise) {
    firestoreClientPromise = import("@google-cloud/firestore").then(({ Firestore }) => {
      return new Firestore(getGoogleClientOptions());
    });
  }
  return firestoreClientPromise;
}

async function getVercelBlobClient() {
  if (!vercelBlobClientPromise) {
    vercelBlobClientPromise = import("@vercel/blob");
  }
  return vercelBlobClientPromise;
}

async function readBlobJson(pathname, fallback) {
  const { get } = await getVercelBlobClient();

  try {
    const blob = await get(pathname, {
      access: "private",
      token: BLOB_READ_WRITE_TOKEN
    });
    if (!blob?.stream) {
      return fallback;
    }
    const data = JSON.parse(await streamToString(blob.stream));
    if (Array.isArray(fallback)) {
      return Array.isArray(data) ? data : fallback;
    }
    return {
      ...fallback,
      ...(data && typeof data === "object" ? data : {})
    };
  } catch {
    return fallback;
  }
}

async function writeBlobJson(pathname, payload) {
  const { put } = await getVercelBlobClient();
  await put(pathname, JSON.stringify(payload, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
    token: BLOB_READ_WRITE_TOKEN
  });
}

async function streamToString(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }

  return result + decoder.decode();
}

async function pipeWebStreamToResponse(stream, res) {
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }

  res.end();
}

async function runDeepHealthCheck() {
  const checks = {
    vercelBlob: { ok: false },
    firestore: { ok: false },
    storage: { ok: false }
  };

  if (USE_VERCEL_BLOB) {
    try {
      await readBlobJson(BLOB_SETTINGS_PATH, DEFAULT_SETTINGS);
      checks.vercelBlob = { ok: true };
    } catch (error) {
      checks.vercelBlob = {
        ok: false,
        error: serializeError(error)
      };
    }
    return checks;
  }

  if (!USE_GOOGLE_CLOUD) {
    return checks;
  }

  try {
    const db = await getFirestoreClient();
    await db.collection("settings").doc("app").get();
    checks.firestore = { ok: true };
  } catch (error) {
    checks.firestore = {
      ok: false,
      error: serializeError(error)
    };
  }

  try {
    const storage = await getStorageClient();
    await storage.bucket(process.env.GCS_BUCKET_NAME).exists();
    checks.storage = { ok: true };
  } catch (error) {
    checks.storage = {
      ok: false,
      error: serializeError(error)
    };
  }

  return checks;
}

async function readGallery() {
  if (USE_VERCEL_BLOB) {
    const localGallery =
      process.env.DISABLE_LOCAL_SEED !== "true" && fs.existsSync(GALLERY_FILE)
        ? readLocalGallery()
        : [];
    return readBlobJson(BLOB_GALLERY_PATH, localGallery);
  }

  if (USE_GOOGLE_CLOUD) {
    const db = await getFirestoreClient();
    const snapshot = await db.collection("gallery").orderBy("createdAt", "desc").get();
    if (snapshot.empty && process.env.DISABLE_LOCAL_SEED !== "true" && fs.existsSync(GALLERY_FILE)) {
      return readLocalGallery();
    }

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
  }

  return readLocalGallery();
}

async function writeGallery(items) {
  if (USE_VERCEL_BLOB) {
    await writeBlobJson(BLOB_GALLERY_PATH, items);
    return;
  }

  if (USE_GOOGLE_CLOUD) {
    const db = await getFirestoreClient();
    const collection = db.collection("gallery");
    const existing = await collection.get();
    const batch = db.batch();

    existing.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    items.forEach((item) => {
      const { id, ...data } = item;
      batch.set(collection.doc(id), data);
    });

    await batch.commit();
    return;
  }

  fs.writeFileSync(GALLERY_FILE, JSON.stringify(items, null, 2), "utf8");
}

async function readSettings() {
  if (USE_VERCEL_BLOB) {
    const localSettings =
      process.env.DISABLE_LOCAL_SEED !== "true" && fs.existsSync(SETTINGS_FILE)
        ? readLocalSettings()
        : DEFAULT_SETTINGS;
    return readBlobJson(BLOB_SETTINGS_PATH, localSettings);
  }

  if (USE_GOOGLE_CLOUD) {
    const db = await getFirestoreClient();
    const snapshot = await db.collection("settings").doc("app").get();
    const localSettings =
      process.env.DISABLE_LOCAL_SEED !== "true" && fs.existsSync(SETTINGS_FILE)
        ? readLocalSettings()
        : {};

    return {
      ...DEFAULT_SETTINGS,
      ...localSettings,
      ...(snapshot.exists ? snapshot.data() : {})
    };
  }

  return readLocalSettings();
}

async function writeSettings(settings) {
  if (USE_VERCEL_BLOB) {
    await writeBlobJson(BLOB_SETTINGS_PATH, settings);
    return;
  }

  if (USE_GOOGLE_CLOUD) {
    const db = await getFirestoreClient();
    await db.collection("settings").doc("app").set(settings, { merge: true });
    return;
  }

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 35 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sanitizeName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function getExtensionFromMime(mimeType) {
  const lookup = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov"
  };
  return lookup[mimeType] || "";
}

function getPublicBaseUrl(req) {
  const configuredUrl = process.env.PUBLIC_API_URL;
  if (configuredUrl) {
    const normalized = configuredUrl.startsWith("http")
      ? configuredUrl
      : `https://${configuredUrl}`;
    return normalized.replace(/\/$/, "");
  }

  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}`;
}

function getPublicStorageUrl(storagePath) {
  const bucketName = process.env.GCS_BUCKET_NAME;
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  return `https://storage.googleapis.com/${bucketName}/${encodedPath}`;
}

function serveStatic(req, res) {
  const requestPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);

  let baseDir = PUBLIC_DIR;
  let safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");

  if (requestPath === "/admin.html" || requestPath === "/admin.js") {
    if (!hasAdminEntry(req)) {
      sendText(res, 404, "Not found");
      return;
    }
    baseDir = PROTECTED_DIR;
    safePath = requestPath;
  }

  let filePath = path.join(baseDir, safePath);

  if (!filePath.startsWith(baseDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = baseDir === PUBLIC_DIR ? path.join(PUBLIC_DIR, "index.html") : "";
  }

  if (!filePath || !fs.existsSync(filePath)) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

async function uploadMediaBuffer({ filename, mimeType, buffer }) {
  if (USE_VERCEL_BLOB) {
    const { put } = await getVercelBlobClient();
    const storagePath = `${BLOB_UPLOAD_PREFIX}/${filename}`;
    const blob = await put(storagePath, buffer, {
      access: "private",
      addRandomSuffix: false,
      contentType: mimeType,
      token: BLOB_READ_WRITE_TOKEN
    });

    return {
      url: `/api/blob?path=${encodeURIComponent(blob.pathname || storagePath)}`,
      storagePath: blob.pathname || storagePath
    };
  }

  if (USE_GOOGLE_CLOUD) {
    const storage = await getStorageClient();
    const storagePath = `uploads/${filename}`;
    const file = storage.bucket(process.env.GCS_BUCKET_NAME).file(storagePath);

    await file.save(buffer, {
      resumable: false,
      predefinedAcl: process.env.GCS_PREDEFINED_ACL || undefined,
      metadata: {
        contentType: mimeType,
        cacheControl: "public, max-age=31536000, immutable"
      }
    });

    if (process.env.GCS_MAKE_PUBLIC === "true") {
      await file.makePublic();
    }

    return {
      url: getPublicStorageUrl(storagePath),
      storagePath
    };
  }

  const absolutePath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(absolutePath, buffer);
  return {
    url: `/uploads/${filename}`,
    storagePath: filename
  };
}

async function deleteMediaAsset(item) {
  const mediaItems = getEntryMedia(item);

  if (mediaItems.length > 1) {
    await Promise.all(mediaItems.map((media) => deleteSingleMediaAsset(media)));
    return;
  }

  await deleteSingleMediaAsset(item);
}

async function deleteSingleMediaAsset(item) {
  if (USE_VERCEL_BLOB) {
    const target = item.storagePath || item.url;
    if (target) {
      const { del } = await getVercelBlobClient();
      await del(target, {
        token: BLOB_READ_WRITE_TOKEN
      });
    }
    return;
  }

  if (USE_GOOGLE_CLOUD) {
    if (item.storagePath) {
      const storage = await getStorageClient();
      await storage.bucket(process.env.GCS_BUCKET_NAME).file(item.storagePath).delete({
        ignoreNotFound: true
      });
    }
    return;
  }

  const targetPath = path.join(UPLOADS_DIR, item.filename);
  if (fs.existsSync(targetPath) && !item.filename.startsWith("seed-heart")) {
    fs.unlinkSync(targetPath);
  }
}

function getEntryMedia(item) {
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
  ].filter((media) => media.url || media.filename || media.storagePath);
}

function parseUploadFiles(body) {
  if (Array.isArray(body.files) && body.files.length) {
    return body.files;
  }

  if (body.fileData && body.mimeType) {
    return [
      {
        originalName: body.originalName,
        mimeType: body.mimeType,
        fileData: body.fileData
      }
    ];
  }

  return [];
}

async function handleApi(req, res) {
  const requestUrl = new URL(req.url, "http://localhost");
  const pathname = requestUrl.pathname;

  if (req.method === "GET" && pathname === "/api/health") {
    const deep = requestUrl.searchParams.get("deep") === "true";
    sendJson(res, 200, {
      ok: true,
      storage: getStorageBackend(),
      vercelBlobConfig: VERCEL_BLOB_CONFIG_STATUS,
      googleConfig: GOOGLE_CONFIG_STATUS,
      checks: deep ? await runDeepHealthCheck() : undefined
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/blob") {
    if (!USE_VERCEL_BLOB) {
      sendText(res, 404, "Not found");
      return;
    }

    const blobPath = requestUrl.searchParams.get("path") || "";
    if (!blobPath || blobPath.includes("..") || blobPath.startsWith("/")) {
      sendText(res, 400, "Invalid blob path");
      return;
    }

    const { get } = await getVercelBlobClient();
    const blob = await get(blobPath, {
      access: "private",
      token: BLOB_READ_WRITE_TOKEN
    });

    if (!blob?.stream) {
      sendText(res, 404, "Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": blob.blob.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
      ...(blob.blob.size ? { "Content-Length": String(blob.blob.size) } : {})
    });
    await pipeWebStreamToResponse(blob.stream, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/gallery") {
    const gallery = normalizeBlobGallery(
      (await readGallery()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    );
    sendJson(res, 200, gallery);
    return;
  }

  if (req.method === "GET" && pathname === "/api/site-config") {
    sendJson(res, 200, normalizeBlobSettings(await readSettings()));
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/shortcut") {
    const token = createAdminEntryToken();
    const cookieParts = getAdminEntryCookieParts(token, 300);

    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": cookieParts.join("; ")
    });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/login") {
    const body = await parseBody(req).catch(() => null);
    if (!body || body.password !== ADMIN_PASSWORD) {
      sendJson(res, 401, { error: "Password salah." });
      return;
    }

    const token = createSessionToken();
    const cookieParts = getSessionCookieParts(token, 1209600);

    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": cookieParts.join("; ")
    });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/logout") {
    const cookieParts = getSessionCookieParts("", 0);

    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": cookieParts.join("; ")
    });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/session") {
    sendJson(res, 200, { authenticated: isAuthenticated(req) });
    return;
  }

  if (!isAuthenticated(req)) {
    sendJson(res, 401, { error: "Akses admin ditolak." });
    return;
  }

  if (req.method === "PUT" && pathname === "/api/admin/settings") {
    const body = await parseBody(req).catch(() => null);
    const heartSlots = Number(body?.heartSlots);
    const anniversaryDate = body?.anniversaryDate || "";
    const musicTitle = body?.musicTitle || "";
    const musicUrl = body?.musicUrl || "";
    const musicFile = body?.musicFile || null;
    const galleryCount = (await readGallery()).length;

    if (!Number.isInteger(heartSlots) || heartSlots < 1 || heartSlots > 120) {
      sendJson(res, 400, { error: "Jumlah heart harus antara 1 sampai 120." });
      return;
    }

    if (heartSlots < galleryCount) {
      sendJson(res, 400, {
        error: `Jumlah heart tidak boleh lebih kecil dari total memori saat ini (${galleryCount}).`
      });
      return;
    }

    if (anniversaryDate && !/^\d{4}-\d{2}-\d{2}$/.test(anniversaryDate)) {
      sendJson(res, 400, { error: "Format tanggal anniversary tidak valid." });
      return;
    }

    if (musicUrl && !/^https?:\/\/.+|^\/.+/.test(musicUrl)) {
      sendJson(res, 400, { error: "URL musik harus diawali http://, https://, atau /." });
      return;
    }

    const currentSettings = await readSettings();
    let uploadedMusic = {};
    if (musicFile?.fileData) {
      const base64Match = musicFile.fileData.match(/^data:(.+);base64,(.+)$/);
      if (!base64Match) {
        sendJson(res, 400, { error: "Format file musik tidak valid." });
        return;
      }

      const mimeType = musicFile.mimeType || base64Match[1];
      if (!mimeType.startsWith("audio/")) {
        sendJson(res, 400, { error: "File musik harus berupa audio." });
        return;
      }

      const ext = getExtensionFromMime(mimeType);
      if (!ext) {
        sendJson(res, 400, { error: "Format musik belum didukung." });
        return;
      }

      const slug = sanitizeName(musicTitle || musicFile.originalName || "our-song");
      const filename = `${Date.now()}-music-${slug}${ext}`;
      const buffer = Buffer.from(base64Match[2], "base64");
      const uploaded = await uploadMediaBuffer({ filename, mimeType, buffer });

      uploadedMusic = {
        musicFilename: filename,
        musicStoragePath: uploaded.storagePath,
        musicUrl: uploaded.url.startsWith("http")
          ? uploaded.url
          : `${getPublicBaseUrl(req)}${uploaded.url}`
      };

      if (currentSettings.musicStoragePath && currentSettings.musicStoragePath !== uploadedMusic.musicStoragePath) {
        await deleteSingleMediaAsset({
          filename: currentSettings.musicFilename,
          url: currentSettings.musicUrl,
          storagePath: currentSettings.musicStoragePath
        });
      }
    }

    const nextSettings = {
      ...currentSettings,
      heartSlots,
      anniversaryDate,
      musicTitle,
      musicUrl,
      ...uploadedMusic
    };
    await writeSettings(nextSettings);
    sendJson(res, 200, nextSettings);
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/upload") {
    const body = await parseBody(req).catch(() => null);
    const uploadFiles = body ? parseUploadFiles(body) : [];
    if (!body || !uploadFiles.length) {
      sendJson(res, 400, { error: "Data upload tidak lengkap." });
      return;
    }

    const uploadedMedia = await Promise.all(
      uploadFiles.map(async (file, index) => {
        const base64Match = file.fileData?.match(/^data:(.+);base64,(.+)$/);
        if (!base64Match) {
          throw new Error("Format file tidak valid.");
        }

        const mimeType = file.mimeType || base64Match[1];
        const mediaType = mimeType.startsWith("video/") ? "video" : "image";
        const ext = getExtensionFromMime(mimeType);
        const slug = sanitizeName(body.title || file.originalName || "memory");
        const filename = `${Date.now()}-${index + 1}-${slug}${ext}`;
        const buffer = Buffer.from(base64Match[2], "base64");
        const uploaded = await uploadMediaBuffer({ filename, mimeType, buffer });
        const mediaUrl = uploaded.url.startsWith("http")
          ? uploaded.url
          : `${getPublicBaseUrl(req)}${uploaded.url}`;

        return {
          type: mediaType,
          filename,
          url: mediaUrl,
          storagePath: uploaded.storagePath
        };
      })
    );
    const items = await readGallery();
    const primaryMedia = uploadedMedia[0];

    const entry = {
      id: crypto.randomUUID(),
      type: primaryMedia.type,
      title: body.title || "Untitled Memory",
      description: body.description || "",
      filename: primaryMedia.filename,
      url: primaryMedia.url,
      storagePath: primaryMedia.storagePath,
      media: uploadedMedia,
      createdAt: new Date().toISOString(),
      featured: Boolean(body.featured)
    };

    if (entry.featured) {
      items.forEach((item) => {
        item.featured = false;
      });
    }

    items.push(entry);
    await writeGallery(items);
    sendJson(res, 201, entry);
    return;
  }

  if (req.method === "PUT" && (pathname.startsWith("/api/admin/media/") || pathname === "/api/admin/media")) {
    const id = requestUrl.searchParams.get("id") || pathname.split("/").pop();
    const body = await parseBody(req).catch(() => null);
    const items = await readGallery();
    const target = items.find((item) => item.id === id);

    if (!target) {
      sendJson(res, 404, { error: "Memori tidak ditemukan." });
      return;
    }

    if (!body || !body.title) {
      sendJson(res, 400, { error: "Judul memori wajib diisi." });
      return;
    }

    target.title = body.title;
    target.description = body.description || "";
    target.featured = Boolean(body.featured);

    if (target.featured) {
      items.forEach((item) => {
        if (item.id !== target.id) {
          item.featured = false;
        }
      });
    }

    await writeGallery(items);
    sendJson(res, 200, target);
    return;
  }

  if (req.method === "DELETE" && (pathname.startsWith("/api/admin/media/") || pathname === "/api/admin/media")) {
    const id = requestUrl.searchParams.get("id") || pathname.split("/").pop();
    const items = await readGallery();
    const target = items.find((item) => item.id === id);

    if (!target) {
      sendJson(res, 404, { error: "Memori tidak ditemukan." });
      return;
    }

    const nextItems = items.filter((item) => item.id !== id);
    await writeGallery(nextItems);
    await deleteMediaAsset(target);
    sendJson(res, 200, { success: true });
    return;
  }

  sendJson(res, 404, { error: "Endpoint tidak ditemukan." });
}

async function createRequestHandler(options = {}) {
  const { serveStaticFiles = false } = options;

  return async function requestHandler(req, res) {
    try {
      if (req.url.startsWith("/api/")) {
        applyCors(req, res);
        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

        await handleApi(req, res);
        return;
      }

      if (req.url.startsWith("/admin.html") || req.url.startsWith("/admin.js")) {
        serveStatic(req, res);
        return;
      }

      if (serveStaticFiles) {
        serveStatic(req, res);
        return;
      }

      sendJson(res, 404, { error: "Endpoint tidak ditemukan." });
    } catch (error) {
      console.error(error);
      sendJson(res, 500, {
        error: "Terjadi kesalahan pada server.",
        storage: getStorageBackend(),
        vercelBlobConfig: VERCEL_BLOB_CONFIG_STATUS,
        googleConfig: GOOGLE_CONFIG_STATUS,
        detail: serializeError(error)
      });
    }
  };
}

module.exports = {
  createRequestHandler
};
