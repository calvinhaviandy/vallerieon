# Gallery of Us

Website galeri kenangan untuk pasangan, dengan tampilan lucu, modern, minimalis, admin panel, dan upload foto/video.

## Fitur

- Halaman publik untuk menampilkan semua memori
- Hero section dengan memori unggulan
- Heart mission yang jumlah slotnya bisa diatur dari admin
- Admin panel login sederhana
- Upload, edit, dan hapus foto/video dari browser
- Penyimpanan online dengan Google Cloud Storage dan Firestore saat deploy ke Vercel
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

Admin panel lokal:

```text
http://localhost:3000/admin.html
```

Password default lokal:

```text
galleryofus
```

## Deploy Vercel + Google Cloud

Frontend dan API sama-sama jalan di Vercel. Foto/video disimpan di Google Cloud Storage, sementara data galeri dan setting heart disimpan di Firestore.

### 1. Google Cloud

Buat satu project Google Cloud, lalu siapkan:

- Firestore database
- Cloud Storage bucket
- Service account dengan akses ke Firestore dan Storage
- Service account key JSON

Bucket harus bisa dibaca publik supaya gambar/video muncul di website. Cara paling simpel: aktifkan public read untuk object/bucket, atau biarkan app menjalankan `makePublic()` saat upload.

Kalau Firestore masih kosong, app akan memakai data awal dari `data/gallery.json` supaya memori contoh tetap terlihat setelah deploy pertama. Setelah upload/edit dari admin, data akan tersimpan ke Firestore.

### 2. Environment variable Vercel

Isi di Vercel project settings:

```text
ADMIN_PASSWORD=password-admin-kamu
ADMIN_SESSION_SECRET=random-secret-yang-panjang
GCP_PROJECT_ID=id-project-google-cloud
GCS_BUCKET_NAME=nama-bucket-google-cloud
GCP_CLIENT_EMAIL=client_email_dari_service_account
GCP_PRIVATE_KEY=private_key_dari_service_account
```

Catatan untuk `GCP_PRIVATE_KEY`: kalau Vercel menyimpan newline sebagai teks `\n`, app sudah otomatis mengubahnya menjadi newline asli.

Opsional:

```text
FRONTEND_ORIGIN=https://domain-vercel-kamu.vercel.app
GCS_MAKE_PUBLIC=true
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
- `public/admin.html` panel admin
- `public/styles.css` styling utama
- `public/app.js` logika galeri publik
- `public/admin.js` logika admin
- `data/gallery.json` metadata lokal
- `data/settings.json` setting lokal
- `public/uploads/` upload lokal
