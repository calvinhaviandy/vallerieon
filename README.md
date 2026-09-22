# Gallery of Us

Arsip kenangan pribadi berbasis React dengan carousel foto/video, soundtrack Spotify atau audio sendiri, dan panel admin terlindungi.

## Stack

- React 19 untuk halaman publik dan panel admin
- Vite untuk build production
- Tailwind CSS 4 sebagai fondasi visual system
- Animasi CSS ringan untuk transisi carousel dan antarmuka
- Lucide React untuk ikon
- Node.js API tanpa framework di `app-handler.js`
- Vercel Blob atau Google Cloud untuk media dan metadata

## Fitur

- Carousel memori responsif dengan gesture, keyboard, dan animasi
- Beberapa foto/video dalam satu memori
- Spotify search di admin dan Spotify Embed di halaman utama
- Player audio untuk file upload atau direct audio URL
- Upload, edit, featured memory, dan hapus memori
- Kompresi gambar di browser sebelum upload
- Sinkronisasi langsung antara tab admin dan halaman publik
- Admin hanya dapat dibuka melalui shortcut dan cookie entry sementara
- Spotify Embed dimuat hanya setelah tombol play ditekan

## Development

Install dependency dan jalankan aplikasi:

```bash
npm install
npm start
```

`npm start` otomatis menjalankan build Vite lalu membuka server di:

```text
http://localhost:3000
```

Panel admin dibuka dari halaman utama dengan `Ctrl + Alt + A`. Password lokal default adalah `galleryofus`; gunakan `ADMIN_PASSWORD` untuk menggantinya.

Perintah lain:

```bash
npm run build
npm test
```

## Environment

```text
ADMIN_PASSWORD=password-admin-kamu
ADMIN_SESSION_SECRET=random-secret-yang-panjang
SPOTIFY_CLIENT_ID=client-id-aplikasi-spotify
SPOTIFY_CLIENT_SECRET=client-secret-aplikasi-spotify
BLOB_STORE_ID=store-id-kamu
BLOB_READ_WRITE_TOKEN=token-blob-kamu
```

Client Secret Spotify dan token Blob hanya digunakan server. Jangan commit nilai rahasia ke repository.

Environment opsional:

```text
FRONTEND_ORIGIN=https://domain-kamu.com
BLOB_DATA_PREFIX=data
BLOB_UPLOAD_PREFIX=uploads
DISABLE_LOCAL_SEED=true
```

## Batas Upload

- Maksimal 12 file per memori
- Maksimal total 3 MB dari browser setelah kompresi
- Gambar besar dikecilkan dan dikonversi ke WebP otomatis sebelum upload
- Audio upload maksimal 3 MB
- Audio URL harus berupa file `.mp3`, `.m4a`, `.ogg`, atau `.wav`

## Struktur

- `index.html` entry Vite halaman publik
- `admin.html` entry Vite panel admin
- `src/home/` komponen carousel dan music player
- `src/admin/` komponen dashboard admin
- `src/components/` komponen bersama
- `src/lib/` client API dan utilitas media
- `src/styles.css` Tailwind dan visual system
- `vite.config.mjs` build multi-page dan pemindahan admin ke area terlindungi
- `app-handler.js` API, autentikasi, Spotify, dan storage
- `public/` hasil build dan upload lokal
- `protected/admin.html` hasil build admin yang dilayani setelah shortcut
- `data/` seed dan fallback development

## Deploy Vercel

`vercel.json` menjalankan `npm run build`. Halaman publik ditempatkan di `public/`, sedangkan HTML admin dipindahkan ke `protected/` dan tetap melalui pemeriksaan cookie oleh server.

Set semua environment production di Vercel Project Settings, lalu deploy. Jika Blob masih kosong, aplikasi memakai seed dari `data/gallery.json` dan `data/settings.json` sampai perubahan pertama disimpan dari admin.
