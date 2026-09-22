const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, test } = require("node:test");

process.env.ADMIN_PASSWORD = "galleryofus-test";
process.env.ADMIN_SESSION_SECRET = "galleryofus-test-secret";
process.env.SPOTIFY_CLIENT_ID = "spotify-test-client";
process.env.SPOTIFY_CLIENT_SECRET = "spotify-test-secret";
process.env.OPENAI_API_KEY = "openai-test-key";
process.env.OPENAI_VISION_MODEL = "gpt-test-vision";
process.env.OPENAI_REASONING_EFFORT = "medium";

const { createRequestHandler, testUtils } = require("../app-handler");

let server;
let baseUrl;
let lastOpenAIRequest;

async function spotifyFetch(input, options = {}) {
  const url = String(input);
  if (url === "https://accounts.spotify.com/api/token") {
    return new Response(JSON.stringify({ access_token: "spotify-test-token", expires_in: 3600 }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (url.startsWith("https://api.spotify.com/v1/search?")) {
    return new Response(JSON.stringify({
      tracks: {
        items: [
          {
            id: "4uLU6hMCjMI75M1A2tKUQC",
            name: "Our Test Song",
            artists: [{ name: "Test Artist" }],
            album: {
              name: "Test Album",
              images: [{ url: "https://i.scdn.co/image/test" }]
            },
            duration_ms: 201000
          }
        ]
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (url === "https://api.openai.com/v1/responses") {
    lastOpenAIRequest = JSON.parse(options.body);
    return new Response(JSON.stringify({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Hari kecil yang sederhana ini terasa hangat karena dijalani bersama. Senyum yang tertangkap membuat momen ini layak disimpan lebih lama."
            }
          ]
        }
      ]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  throw new Error(`Unexpected external request: ${url}`);
}

before(async () => {
  const handler = await createRequestHandler({ serveStaticFiles: true, fetchImpl: spotifyFetch });
  server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";", 1)[0] || "";
}

test("keeps multiple moments inside one chapter when media is appended", () => {
  const existingMedia = [
    { type: "image", filename: "chapter-cover.jpg", url: "/uploads/chapter-cover.jpg" },
    { type: "image", filename: "chapter-second.jpg", url: "/uploads/chapter-second.jpg" }
  ];
  const newMedia = [
    { type: "image", filename: "chapter-third.jpg", url: "/uploads/chapter-third.jpg" }
  ];

  assert.deepEqual(
    testUtils.mergeMemoryMedia(existingMedia, newMedia, "append"),
    [...existingMedia, ...newMedia]
  );
  assert.deepEqual(
    testUtils.mergeMemoryMedia(existingMedia, newMedia, "replace"),
    newMedia
  );
  assert.throws(
    () => testUtils.mergeMemoryMedia(Array.from({ length: 24 }, (_, index) => ({ filename: `${index}.jpg` })), newMedia),
    /Maksimal 24 momen/
  );
});

test("serves the public app and JSON data", async () => {
  const [home, gallery, config] = await Promise.all([
    fetch(`${baseUrl}/`),
    fetch(`${baseUrl}/api/gallery`),
    fetch(`${baseUrl}/api/site-config`)
  ]);

  assert.equal(home.status, 200);
  assert.match(await home.text(), /Gallery of Us/);
  assert.equal(gallery.status, 200);
  assert.ok(Array.isArray(await gallery.json()));
  assert.equal(config.status, 200);
  assert.equal(typeof (await config.json()).musicTitle, "string");
});

test("keeps admin files behind the shortcut cookie", async () => {
  const directAdmin = await fetch(`${baseUrl}/admin.html`);
  assert.equal(directAdmin.status, 404);

  const directVercelRewrite = await fetch(`${baseUrl}/api/index?__gallery_page=admin`);
  assert.equal(directVercelRewrite.status, 404);

  const shortcut = await fetch(`${baseUrl}/api/admin/shortcut`, { method: "POST" });
  const entryCookie = cookieFrom(shortcut);
  assert.ok(entryCookie.startsWith("admin_entry="));

  const protectedAdmin = await fetch(`${baseUrl}/admin.html`, {
    headers: { Cookie: entryCookie }
  });
  assert.equal(protectedAdmin.status, 200);
  assert.match(await protectedAdmin.text(), /membuka arsip pribadi/);

  const protectedVercelRewrite = await fetch(`${baseUrl}/api/index?__gallery_page=admin`, {
    headers: { Cookie: entryCookie }
  });
  assert.equal(protectedVercelRewrite.status, 200);
  assert.match(await protectedVercelRewrite.text(), /membuka arsip pribadi/);
});

test("creates an admin session and rejects unsupported music links", async () => {
  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "galleryofus-test" })
  });
  const sessionCookie = cookieFrom(login);
  assert.equal(login.status, 200);
  assert.ok(sessionCookie.startsWith("session="));

  const session = await fetch(`${baseUrl}/api/admin/session`, {
    headers: { Cookie: sessionCookie }
  });
  assert.deepEqual(await session.json(), { authenticated: true });

  const spotifySearch = await fetch(`${baseUrl}/api/admin/spotify/search?q=our%20song`, {
    headers: { Cookie: sessionCookie }
  });
  assert.equal(spotifySearch.status, 200);
  assert.deepEqual((await spotifySearch.json()).tracks[0], {
    id: "4uLU6hMCjMI75M1A2tKUQC",
    uri: "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
    url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    name: "Our Test Song",
    artist: "Test Artist",
    album: "Test Album",
    imageUrl: "https://i.scdn.co/image/test",
    durationMs: 201000
  });

  const invalidSpotify = await fetch(`${baseUrl}/api/admin/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: sessionCookie
    },
    body: JSON.stringify({
      musicSource: "spotify",
      spotifyTrack: {
        id: "not-a-track-id",
        name: "Invalid",
        artist: "Invalid"
      }
    })
  });
  assert.equal(invalidSpotify.status, 400);
  assert.match((await invalidSpotify.json()).error, /Pilih lagu/);

  const invalidMusic = await fetch(`${baseUrl}/api/admin/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: sessionCookie
    },
    body: JSON.stringify({
      musicTitle: "Test",
      musicUrl: "https://www.youtube.com/watch?v=test",
      replaceMusicUrl: true
    })
  });
  assert.equal(invalidMusic.status, 400);
  assert.match((await invalidMusic.json()).error, /direct audio file/);

  const invalidMedia = await fetch(`${baseUrl}/api/admin/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: sessionCookie
    },
    body: JSON.stringify({
      title: "Invalid file",
      files: [
        {
          originalName: "notes.txt",
          mimeType: "text/plain",
          fileData: "data:text/plain;base64,dGVzdA=="
        }
      ]
    })
  });
  assert.equal(invalidMedia.status, 400);
  assert.match((await invalidMedia.json()).error, /belum didukung/);

  const aiDescription = await fetch(`${baseUrl}/api/admin/ai/description`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: sessionCookie
    },
    body: JSON.stringify({
      title: "Sore pertama kita",
      image: {
        originalName: "memory.png",
        mimeType: "image/png",
        fileData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
      }
    })
  });
  assert.equal(aiDescription.status, 200);
  assert.deepEqual(await aiDescription.json(), {
    description: "Hari kecil yang sederhana ini terasa hangat karena dijalani bersama. Senyum yang tertangkap membuat momen ini layak disimpan lebih lama.",
    model: "gpt-test-vision"
  });
  assert.equal(lastOpenAIRequest.model, "gpt-test-vision");
  assert.equal(lastOpenAIRequest.reasoning.effort, "medium");
  assert.equal(lastOpenAIRequest.store, false);
  assert.match(lastOpenAIRequest.input[0].content[0].text, /Sore pertama kita/);
  assert.match(lastOpenAIRequest.input[0].content[1].image_url, /^data:image\/png;base64,/);

  const invalidAiImage = await fetch(`${baseUrl}/api/admin/ai/description`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: sessionCookie
    },
    body: JSON.stringify({
      title: "SVG memory",
      image: {
        mimeType: "image/svg+xml",
        fileData: "data:image/svg+xml;base64,PHN2Zy8+"
      }
    })
  });
  assert.equal(invalidAiImage.status, 400);
  assert.match((await invalidAiImage.json()).error, /belum didukung/);
});

test("returns 404 for missing static assets", async () => {
  const response = await fetch(`${baseUrl}/uploads/does-not-exist.jpg`);
  assert.equal(response.status, 404);
});
