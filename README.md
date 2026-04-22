# Gallery of Us

Website galeri kenangan untuk pasangan, dengan tampilan lucu, modern, minimalis, dan admin panel untuk upload foto atau video.

## Fitur

- Halaman publik untuk menampilkan semua memori
- Hero section dengan memori unggulan
- Admin panel login sederhana
- Upload foto dan video dari browser
- Hapus memori dari panel admin
- Penyimpanan file lokal di folder `public/uploads`

## Cara menjalankan

1. Buka terminal di folder project ini.
2. Jalankan:

```bash
npm start
```

3. Buka browser ke:

```text
http://localhost:3000
```

## Admin panel

- URL admin: `http://localhost:3000/admin.html`
- Password default: `galleryofus`

Kalau ingin mengganti password admin, jalankan server dengan environment variable:

```bash
$env:ADMIN_PASSWORD="password-baru"
npm start
```

## Struktur utama

- `server.js` server HTTP ringan tanpa dependency tambahan
- `public/index.html` halaman publik
- `public/admin.html` panel admin
- `public/styles.css` styling utama
- `public/app.js` logika galeri publik
- `public/admin.js` logika admin
- `data/gallery.json` metadata semua memori
- `public/uploads/` file foto dan video yang diunggah

## Catatan publish

Versi ini sudah cocok untuk dijalankan lokal atau dideploy ke VPS/server Node sederhana. Kalau nanti ingin benar-benar dipakai banyak orang secara online dengan keamanan yang lebih kuat, langkah berikutnya yang bagus adalah:

- pindahkan login admin ke sistem auth yang lebih aman
- simpan file ke cloud storage
- pakai database untuk metadata galeri
- tambahkan domain publik dan HTTPS
