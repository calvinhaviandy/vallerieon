# Gallery of Us

Website galeri kenangan untuk pasangan, dengan tampilan lucu, modern, minimalis, admin panel, dan upload foto/video.

## Fitur

- Halaman publik untuk menampilkan semua memori
- Carousel memori dengan player musik
- Shortcut admin dari halaman utama
- Admin panel login sederhana
- Upload, edit, dan hapus foto/video dari browser
- Upload musik untuk player dari admin
- Penyimpanan online dengan Vercel Blob saat deploy ke Vercel
- Fallback penyimpanan lokal untuk development

## Cara menjalankan lokal

1. Install dependency:

```bash
npm install
```

2. Jalankan server:

```bash
npm start
```

3. Buka:

```text
http://localhost:3000
```

Admin panel lokal dibuka dari halaman utama dengan shortcut:

```text
Ctrl + R
```

Password default lokal:

```text
galleryofus
```

## Deploy Vercel + Vercel Blob

Frontend dan API sama-sama jalan di Vercel. Foto, video, musik, data galeri, dan setting halaman utama disimpan di Vercel Blob.

### 1. Vercel Blob

Buat Blob store di Vercel, lalu isi environment variable project:

```text
BLOB_STORE_ID=store-id-kamu
BLOB_READ_WRITE_TOKEN=token-blob-kamu
ADMIN_PASSWORD=password-admin-kamu
ADMIN_SESSION_SECRET=random-secret-yang-panjang
```

Jangan commit token Blob ke repository. Simpan hanya di Vercel Project Settings.

Kalau Blob masih kosong, app akan memakai data awal dari `data/gallery.json` dan `data/settings.json`. Setelah upload/edit dari admin, data akan tersimpan ke Vercel Blob.

### 2. Environment variable opsional

```text
FRONTEND_ORIGIN=https://domain-vercel-kamu.vercel.app
BLOB_DATA_PREFIX=data
BLOB_UPLOAD_PREFIX=uploads
DISABLE_LOCAL_SEED=true
```

### 3. Config frontend

Untuk Vercel full app, `public/config.js` cukup seperti ini:

```js
window.GALLERY_API_BASE = "";
```

Artinya frontend akan memanggil API dari domain Vercel yang sama, misalnya:

```text
https://domain-kamu.vercel.app/api/gallery
```

## Struktur utama

- `server.js` server lokal
- `app-handler.js` handler API bersama untuk lokal dan Vercel
- `api/index.js` entrypoint Vercel serverless API
- `public/index.html` halaman publik
- `protected/admin.html` panel admin
- `protected/admin.js` logika admin
- `public/styles.css` styling utama
- `public/app.js` logika galeri publik
- `data/gallery.json` metadata lokal
- `data/settings.json` setting lokal
- `public/uploads/` upload lokal
