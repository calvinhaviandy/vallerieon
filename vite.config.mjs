import { existsSync, mkdirSync, rmSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const publicAssets = resolve(projectRoot, "public", "assets");
const builtAdminPage = resolve(projectRoot, "public", "admin.html");
const protectedAdminPage = resolve(projectRoot, "protected", "admin.html");

function protectedAdminBuild() {
  return {
    name: "gallery-protected-admin-build",
    buildStart() {
      rmSync(publicAssets, { recursive: true, force: true });
      rmSync(builtAdminPage, { force: true });
    },
    closeBundle() {
      if (!existsSync(builtAdminPage)) return;
      mkdirSync(resolve(projectRoot, "protected"), { recursive: true });
      rmSync(protectedAdminPage, { force: true });
      renameSync(builtAdminPage, protectedAdminPage);
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), protectedAdminBuild()],
  publicDir: false,
  build: {
    outDir: "public",
    emptyOutDir: false,
    sourcemap: false,
    rollupOptions: {
      input: {
        index: resolve(projectRoot, "index.html"),
        admin: resolve(projectRoot, "admin.html")
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
