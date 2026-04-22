const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "galleryofus";
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || ADMIN_PASSWORD;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");
const DATA_DIR = path.join(__dirname, "data");
const GALLERY_FILE = path.join(DATA_DIR, "gallery.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

ensureStorage();

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
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ico": "image/x-icon"
};

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(GALLERY_FILE)) {
    fs.writeFileSync(GALLERY_FILE, "[]", "utf8");
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(
      SETTINGS_FILE,
      JSON.stringify({ heartSlots: 41 }, null, 2),
      "utf8"
    );
  }
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
  const signature = signSession(payload);
  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes(".")) {
    return false;
  }

  const [payload, signature] = token.split(".");
  const expected = signSession(payload);

  if (signature !== expected) {
    return false;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payload));
    return typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  const token = cookies.session;
  return verifySessionToken(token);
}

function readGallery() {
  return JSON.parse(fs.readFileSync(GALLERY_FILE, "utf8"));
}

function writeGallery(items) {
  fs.writeFileSync(GALLERY_FILE, JSON.stringify(items, null, 2), "utf8");
}

function readSettings() {
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
}

function writeSettings(settings) {
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
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov"
  };
  return lookup[mimeType] || "";
}

function serveStatic(req, res) {
  const requestPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, "index.html");
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

async function handleApi(req, res) {
  if (req.method === "GET" && req.url === "/api/gallery") {
    const gallery = readGallery().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    sendJson(res, 200, gallery);
    return;
  }

  if (req.method === "GET" && req.url === "/api/site-config") {
    sendJson(res, 200, readSettings());
    return;
  }

  if (req.method === "POST" && req.url === "/api/admin/login") {
    const body = await parseBody(req).catch(() => null);
    if (!body || body.password !== ADMIN_PASSWORD) {
      sendJson(res, 401, { error: "Password salah." });
      return;
    }

    const token = createSessionToken();
    const cookieParts = [
      `session=${token}`,
      "HttpOnly",
      "Path=/",
      "SameSite=Lax",
      "Max-Age=1209600"
    ];
    if (IS_PRODUCTION) {
      cookieParts.push("Secure");
    }
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": cookieParts.join("; ")
    });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/admin/logout") {
    const cookieParts = [
      "session=",
      "HttpOnly",
      "Path=/",
      "SameSite=Lax",
      "Max-Age=0"
    ];
    if (IS_PRODUCTION) {
      cookieParts.push("Secure");
    }
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": cookieParts.join("; ")
    });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (req.method === "GET" && req.url === "/api/admin/session") {
    sendJson(res, 200, { authenticated: isAuthenticated(req) });
    return;
  }

  if (!isAuthenticated(req)) {
    sendJson(res, 401, { error: "Akses admin ditolak." });
    return;
  }

  if (req.method === "PUT" && req.url === "/api/admin/settings") {
    const body = await parseBody(req).catch(() => null);
    const heartSlots = Number(body?.heartSlots);
    const galleryCount = readGallery().length;

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

    const nextSettings = {
      ...readSettings(),
      heartSlots
    };
    writeSettings(nextSettings);
    sendJson(res, 200, nextSettings);
    return;
  }

  if (req.method === "POST" && req.url === "/api/admin/upload") {
    const body = await parseBody(req).catch(() => null);
    if (!body || !body.fileData || !body.mimeType) {
      sendJson(res, 400, { error: "Data upload tidak lengkap." });
      return;
    }

    const base64Match = body.fileData.match(/^data:(.+);base64,(.+)$/);
    if (!base64Match) {
      sendJson(res, 400, { error: "Format file tidak valid." });
      return;
    }

    const mimeType = body.mimeType;
    const mediaType = mimeType.startsWith("video/") ? "video" : "image";
    const ext = getExtensionFromMime(mimeType);
    const slug = sanitizeName(body.title || body.originalName || "memory");
    const filename = `${Date.now()}-${slug}${ext}`;
    const absolutePath = path.join(UPLOADS_DIR, filename);
    const buffer = Buffer.from(base64Match[2], "base64");

    fs.writeFileSync(absolutePath, buffer);

    const items = readGallery();
    const entry = {
      id: crypto.randomUUID(),
      type: mediaType,
      title: body.title || "Untitled Memory",
      description: body.description || "",
      filename,
      createdAt: new Date().toISOString(),
      featured: Boolean(body.featured)
    };

    if (entry.featured) {
      items.forEach((item) => {
        item.featured = false;
      });
    }

    items.push(entry);
    writeGallery(items);
    sendJson(res, 201, entry);
    return;
  }

  if (req.method === "PUT" && req.url.startsWith("/api/admin/media/")) {
    const id = req.url.split("/").pop();
    const body = await parseBody(req).catch(() => null);
    const items = readGallery();
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

    writeGallery(items);
    sendJson(res, 200, target);
    return;
  }

  if (req.method === "DELETE" && req.url.startsWith("/api/admin/media/")) {
    const id = req.url.split("/").pop();
    const items = readGallery();
    const target = items.find((item) => item.id === id);

    if (!target) {
      sendJson(res, 404, { error: "Memori tidak ditemukan." });
      return;
    }

    const nextItems = items.filter((item) => item.id !== id);
    writeGallery(nextItems);

    const targetPath = path.join(UPLOADS_DIR, target.filename);
    if (fs.existsSync(targetPath) && !target.filename.startsWith("seed-heart")) {
      fs.unlinkSync(targetPath);
    }

    sendJson(res, 200, { success: true });
    return;
  }

  sendJson(res, 404, { error: "Endpoint tidak ditemukan." });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    serveStatic(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Terjadi kesalahan pada server." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Gallery of Us berjalan di http://${HOST}:${PORT}`);
});
