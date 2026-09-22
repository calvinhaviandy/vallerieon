const http = require("http");
const path = require("path");

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(path.join(__dirname, ".env.local"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const { createRequestHandler } = require("./app-handler");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";

(async () => {
  const handler = await createRequestHandler({ serveStaticFiles: true });
  const server = http.createServer(handler);

  server.listen(PORT, HOST, () => {
    console.log(`Gallery of Us berjalan di http://${HOST}:${PORT}`);
  });
})();
