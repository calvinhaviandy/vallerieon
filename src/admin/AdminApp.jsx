import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  CloudUpload,
  Eye,
  EyeOff,
  FileAudio,
  ImagePlus,
  Images,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Music2,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { Logo } from "../components/Logo";
import { MediaAsset } from "../components/MediaAsset";
import { createSyncChannel, request } from "../lib/api";
import {
  formatDate,
  formatDuration,
  formatSize,
  getActiveMusicSource,
  getMemoryMedia,
  isDirectAudioUrl,
  MAX_REQUEST_FILE_BYTES,
  prepareFiles,
  readFileAsDataUrl
} from "../lib/media";

function Message({ message }) {
  if (!message?.text) return null;
  return (
    <p
      className={`admin-message admin-message-${message.type || "info"}`}
      role="status"
    >
      {message.type === "error" && <CircleAlert />}
      {message.type === "success" && <Check />}
      {message.text}
    </p>
  );
}

function BusyLabel({ busy, busyText, children }) {
  return busy ? <><LoaderCircle className="animate-spin" />{busyText}</> : children;
}

function AdminToast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast || toast.type === "info") return undefined;
    const timer = window.setTimeout(onDismiss, 4500);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const ToastIcon = toast.type === "error"
    ? CircleAlert
    : toast.type === "featured"
      ? Sparkles
      : toast.type === "info"
        ? LoaderCircle
        : Check;

  return (
    <aside
      className={`admin-toast admin-toast-${toast.type || "success"}`}
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
    >
      <span className="admin-toast-icon"><ToastIcon className={toast.type === "info" ? "animate-spin" : ""} /></span>
      <span className="admin-toast-copy"><strong>{toast.title}</strong><small>{toast.text}</small></span>
      <button type="button" onClick={onDismiss} aria-label="Tutup notifikasi" title="Tutup notifikasi"><X /></button>
    </aside>
  );
}

function SpotifyArtwork({ track, className = "spotify-art" }) {
  if (!track?.imageUrl) {
    return <span className={`${className} spotify-art-fallback`}><Music2 /></span>;
  }
  return <img className={className} src={track.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />;
}

function LoginView({ onLogin }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage({ text: "Memeriksa akses...", type: "info" });
    try {
      await request("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password })
      });
      setPassword("");
      setMessage(null);
      await onLogin();
    } catch (error) {
      setMessage({ text: error.message, type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-view">
      <a className="admin-back-link" href="/" aria-label="Kembali ke galeri">
        <ArrowLeft /> <span>Kembali</span>
      </a>
      <section className="login-panel">
        <div className="login-panel-top">
          <Logo />
          <span className="login-private-label"><Sparkles /> Private access</span>
        </div>
        <div className="login-hero">
          <div className="login-lock"><LockKeyhole /></div>
          <div className="login-heading">
            <p>Selamat datang kembali</p>
            <h1>Masuk ke panel admin</h1>
          </div>
        </div>
        <p className="login-subtitle">Ruang kecil untuk semua hal yang ingin kita simpan.</p>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="admin-password">Password</label>
          <div className="field-with-action">
            <input
              id="admin-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Masukkan password"
              autoComplete="current-password"
              required
              autoFocus
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"} title={showPassword ? "Sembunyikan password" : "Tampilkan password"}>
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
          </div>
          <button className="admin-primary-button login-submit" type="submit" disabled={busy}>
            <BusyLabel busy={busy} busyText="Memeriksa"><span>Masuk</span><ChevronRight /></BusyLabel>
          </button>
          <Message message={message} />
        </form>
        <p className="login-private-note"><LockKeyhole /> Hanya untuk kita</p>
      </section>
      <span className="login-edition">Gallery control room / 2026</span>
    </main>
  );
}

function PanelHeading({ eyebrow, title, icon: Icon, action }) {
  return (
    <div className="admin-panel-heading">
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action || (Icon && <span className="panel-heading-icon"><Icon /></span>)}
    </div>
  );
}

function TrackCopy({ track, label }) {
  return (
    <span className="spotify-copy">
      {label && <small>{label}</small>}
      <strong>{track.name}</strong>
      <span>{[track.artist, track.album].filter(Boolean).join(" / ")}</span>
    </span>
  );
}

function MusicPanel({ settings, onSaved, onUnauthorized, notify }) {
  const [source, setSource] = useState("spotify");
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [musicTitle, setMusicTitle] = useState("");
  const [musicUrl, setMusicUrl] = useState("");
  const [musicFile, setMusicFile] = useState(null);
  const [removeMusic, setRemoveMusic] = useState(false);
  const initialUrl = useRef("");

  useEffect(() => {
    const activeSource = getActiveMusicSource(settings);
    setSource(activeSource === "audio" ? "audio" : "spotify");
    setSelectedTrack(settings.spotifyTrack || null);
    setMusicTitle(settings.musicTitle || "");
    setMusicUrl(settings.musicUrl || "");
    setMusicFile(null);
    setRemoveMusic(false);
    initialUrl.current = settings.musicUrl || "";
  }, [settings]);

  function handleError(error) {
    if (error.status === 401) {
      onUnauthorized();
      return;
    }
    setMessage({ text: error.message, type: "error" });
  }

  async function searchSpotify(event) {
    event?.preventDefault();
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) {
      setMessage({ text: "Masukkan minimal 2 karakter untuk mencari lagu.", type: "error" });
      return;
    }
    setSearching(true);
    setMessage({ text: "Mencari di Spotify...", type: "info" });
    try {
      const data = await request(`/api/admin/spotify/search?q=${encodeURIComponent(cleanQuery)}`);
      const tracks = Array.isArray(data.tracks) ? data.tracks : [];
      setResults(tracks);
      setMessage({
        text: tracks.length ? `${tracks.length} lagu ditemukan.` : "Tidak ada lagu yang cocok.",
        type: tracks.length ? "success" : "info"
      });
    } catch (error) {
      setResults([]);
      handleError(error);
    } finally {
      setSearching(false);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSaving(true);
    setMessage({ text: "Menyimpan soundtrack...", type: "info" });
    try {
      if (source === "spotify" && !selectedTrack && !removeMusic) {
        throw new Error("Cari dan pilih satu lagu Spotify terlebih dahulu.");
      }
      if (musicFile && musicFile.size > MAX_REQUEST_FILE_BYTES) {
        throw new Error(`File audio maksimal ${formatSize(MAX_REQUEST_FILE_BYTES)}.`);
      }
      const encodedMusic = musicFile
        ? {
            originalName: musicFile.name,
            mimeType: musicFile.type,
            fileData: await readFileAsDataUrl(musicFile)
          }
        : null;

      const saved = await request("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          musicSource: source,
          musicTitle: musicTitle.trim(),
          musicUrl: musicUrl.trim(),
          musicFile: encodedMusic,
          spotifyTrack: selectedTrack,
          removeMusic,
          replaceMusicUrl: source === "audio" && !encodedMusic && musicUrl.trim() !== initialUrl.current
        })
      });
      onSaved(saved);
      notify("settings");
      setMessage({
        text: saved.musicSource === "spotify"
          ? `“${saved.spotifyTrack.name}” tampil di halaman utama.`
          : saved.musicSource === "audio"
            ? "Soundtrack halaman utama diperbarui."
            : "Soundtrack dihapus dari halaman utama.",
        type: "success"
      });
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  }

  const activeSource = getActiveMusicSource(settings);
  const hasCurrentMusic = activeSource !== "none";

  return (
    <section id="music-settings" className="admin-surface music-workspace">
      <PanelHeading eyebrow="Soundtrack" title="Music player" icon={Music2} />
      <form onSubmit={saveSettings}>
        <div className="source-segments" role="tablist" aria-label="Sumber musik">
          <button className={source === "spotify" ? "is-active" : ""} type="button" role="tab" aria-selected={source === "spotify"} onClick={() => { setSource("spotify"); setRemoveMusic(false); }}>
            <Music2 /> Spotify
          </button>
          <button className={source === "audio" ? "is-active" : ""} type="button" role="tab" aria-selected={source === "audio"} onClick={() => { setSource("audio"); setRemoveMusic(false); }}>
            <FileAudio /> Audio file
          </button>
        </div>

        {source === "spotify" ? (
          <div className="music-source-content">
            <label className="field-label" htmlFor="spotify-search">Cari lagu</label>
            <div className="search-field">
              <Search />
              <input id="spotify-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") searchSpotify(event); }} placeholder="Judul atau nama penyanyi" />
              <button type="button" onClick={searchSpotify} disabled={searching} aria-label="Cari lagu" title="Cari lagu">
                {searching ? <LoaderCircle className="animate-spin" /> : <ArrowUpRight />}
              </button>
            </div>

            {selectedTrack && (
              <div className="selected-track">
                <SpotifyArtwork track={selectedTrack} />
                <TrackCopy track={selectedTrack} label="Selected track" />
                <span className="track-duration">{formatDuration(selectedTrack.durationMs)}</span>
                <span className="selected-check"><Check /></span>
              </div>
            )}

            {results.length > 0 && (
              <div className="spotify-results">
                {results.map((track) => (
                  <button
                    className={selectedTrack?.id === track.id ? "spotify-result is-selected" : "spotify-result"}
                    type="button"
                    key={track.id}
                    onClick={() => {
                      setSelectedTrack(track);
                      setRemoveMusic(false);
                      setMessage({ text: `“${track.name}” dipilih. Simpan untuk menayangkannya.`, type: "success" });
                    }}
                  >
                    <SpotifyArtwork track={track} />
                    <TrackCopy track={track} />
                    <span>{formatDuration(track.durationMs)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="music-source-content audio-source-grid">
            <label>
              <span className="field-label">Judul soundtrack</span>
              <input type="text" value={musicTitle} maxLength="100" onChange={(event) => setMusicTitle(event.target.value)} placeholder="Our favorite song" />
            </label>
            <label>
              <span className="field-label">Direct audio URL</span>
              <input type="text" inputMode="url" value={musicUrl} onChange={(event) => { setMusicUrl(event.target.value); setMusicFile(null); setRemoveMusic(false); }} placeholder="https://.../song.mp3" />
            </label>
            <label className="admin-file-picker" htmlFor="music-upload">
              <input id="music-upload" type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/wav,audio/x-wav,.mp3,.m4a,.ogg,.wav" onChange={(event) => { setMusicFile(event.target.files[0] || null); setMusicUrl(""); setRemoveMusic(false); }} />
              <CloudUpload />
              <span><strong>{musicFile ? musicFile.name : "Pilih audio"}</strong><small>{musicFile ? formatSize(musicFile.size) : "MP3, M4A, OGG, WAV"}</small></span>
            </label>
          </div>
        )}

        {hasCurrentMusic && (
          <label className="admin-check-row">
            <input type="checkbox" checked={removeMusic} onChange={(event) => setRemoveMusic(event.target.checked)} />
            <span>Hapus soundtrack aktif</span>
          </label>
        )}

        {hasCurrentMusic && (
          <div className="current-track-strip">
            {activeSource === "spotify" ? (
              <>
                <SpotifyArtwork track={settings.spotifyTrack} className="current-track-art" />
                <TrackCopy track={settings.spotifyTrack} label="Live on homepage" />
                <a href={settings.spotifyTrack.url} target="_blank" rel="noreferrer" aria-label="Buka lagu aktif" title="Buka lagu aktif"><ArrowUpRight /></a>
              </>
            ) : (
              <>
                <span className="current-track-art spotify-art-fallback"><FileAudio /></span>
                <span className="spotify-copy"><small>{isDirectAudioUrl(settings.musicUrl) ? "Live on homepage" : "Audio unavailable"}</small><strong>{settings.musicTitle || "Tanpa judul"}</strong></span>
                {isDirectAudioUrl(settings.musicUrl) && <audio controls preload="metadata" src={settings.musicUrl} />}
              </>
            )}
          </div>
        )}

        <div className="panel-submit-row">
          <Message message={message} />
          <button className="admin-dark-button" type="submit" disabled={saving}>
            <BusyLabel busy={saving} busyText="Menyimpan"><Save /><span>Simpan soundtrack</span></BusyLabel>
          </button>
        </div>
      </form>
    </section>
  );
}

function MemoryEditor({ editingItem, onCancelEdit, onSaved, onUnauthorized, notify, announce, panelRef }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [featured, setFeatured] = useState(false);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [inputKey, setInputKey] = useState(0);

  useEffect(() => {
    if (editingItem) {
      setTitle(editingItem.title || "");
      setDescription(editingItem.description || "");
      setFeatured(Boolean(editingItem.featured));
      setFiles([]);
      setInputKey((value) => value + 1);
      setMessage({ text: "Media lama tetap dipakai jika tidak diganti.", type: "info" });
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editingItem, panelRef]);

  function reset() {
    setTitle("");
    setDescription("");
    setFeatured(false);
    setFiles([]);
    setInputKey((value) => value + 1);
  }

  async function submit(event) {
    event.preventDefault();
    if (!editingItem && !files.length) {
      setMessage({ text: "Pilih minimal satu foto atau video.", type: "error" });
      return;
    }
    setBusy(true);
    setMessage({ text: editingItem ? "Menyimpan perubahan..." : "Menyiapkan media...", type: "info" });
    try {
      let mediaFiles = [];
      if (files.length) {
        const prepared = await prepareFiles(files);
        mediaFiles = await Promise.all(prepared.map(async (file) => ({
          originalName: file.name,
          mimeType: file.type,
          fileData: await readFileAsDataUrl(file)
        })));
      }

      const payload = JSON.stringify({
        title: title.trim(),
        description: description.trim(),
        featured,
        files: mediaFiles
      });

      const wasEditing = Boolean(editingItem);
      const saved = editingItem
        ? await request(`/api/admin/media?id=${encodeURIComponent(editingItem.id)}`, { method: "PUT", body: payload })
        : await request("/api/admin/upload", { method: "POST", body: payload });
      const isFeatured = Boolean(saved.featured);
      const successText = isFeatured
        ? wasEditing
          ? `“${saved.title}” diperbarui dan tampil sebagai featured.`
          : `“${saved.title}” ditambahkan sebagai featured.`
        : wasEditing
          ? `“${saved.title}” berhasil diperbarui.`
          : `“${saved.title}” berhasil ditambahkan.`;

      onSaved(saved);
      reset();
      onCancelEdit();
      notify("gallery");
      setMessage({ text: successText, type: "success" });
      announce({
        type: isFeatured ? "featured" : "success",
        title: isFeatured ? "Featured aktif" : wasEditing ? "Perubahan tersimpan" : "Memori ditambahkan",
        text: successText
      });
    } catch (error) {
      if (error.status === 401) onUnauthorized();
      else {
        setMessage({ text: error.message, type: "error" });
        announce({ type: "error", title: "Gagal menyimpan", text: error.message });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="memory-editor" ref={panelRef} className="admin-surface memory-editor">
      <PanelHeading
        eyebrow={editingItem ? "Edit memory" : "New memory"}
        title={editingItem ? "Perbarui cerita" : "Tambah memori"}
        icon={ImagePlus}
        action={editingItem ? <button className="panel-close-button" type="button" onClick={() => { reset(); onCancelEdit(); setMessage(null); }} aria-label="Batal edit" title="Batal edit"><X /></button> : null}
      />

      <form onSubmit={submit}>
        <label>
          <span className="field-label">Judul memori</span>
          <input type="text" value={title} maxLength="120" onChange={(event) => setTitle(event.target.value)} placeholder="Nama momen ini" required />
        </label>
        <label>
          <span className="field-label">Cerita</span>
          <textarea value={description} maxLength="3000" rows="5" onChange={(event) => setDescription(event.target.value)} placeholder="Tulis hal yang ingin selalu diingat..." />
          <small className="character-count">{description.length}/3000</small>
        </label>

        <label className="memory-dropzone" htmlFor="memory-files">
          <input key={inputKey} id="memory-files" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,video/mp4,video/webm,video/quicktime" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} />
          <span className="dropzone-icon"><Plus /></span>
          <span><strong>{files.length ? `${files.length} file dipilih` : editingItem ? "Ganti media" : "Tambah foto atau video"}</strong><small>Tarik file ke sini atau pilih dari perangkat</small></span>
          <CloudUpload />
        </label>

        {files.length > 0 && (
          <div className="selected-file-list">
            {files.map((file) => (
              <div key={`${file.name}-${file.lastModified}`}><span>{file.name}</span><small>{formatSize(file.size)}</small></div>
            ))}
          </div>
        )}

        <label className="admin-check-row featured-check">
          <input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} />
          <span><strong>Featured memory</strong><small>Tampil pertama saat galeri dibuka</small></span>
          <Sparkles />
        </label>

        <div className="panel-submit-row">
          <Message message={message} />
          <button className="admin-primary-button" type="submit" disabled={busy}>
            <BusyLabel busy={busy} busyText="Mengunggah"><CloudUpload /><span>{editingItem ? "Simpan perubahan" : "Upload memori"}</span></BusyLabel>
          </button>
        </div>
      </form>
    </section>
  );
}

function MemoryLibrary({ items, onEdit, onDeleteStarted, onDeleteFailed, onUnauthorized, notify, announce }) {
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState(null);

  async function remove(item) {
    if (!window.confirm(`Hapus “${item.title}” beserta semua medianya?`)) return;
    setDeletingId(item.id);
    onDeleteStarted(item.id);
    setMessage({ text: `Menghapus “${item.title}”...`, type: "info" });
    announce({
      type: "info",
      title: "Menghapus memori",
      text: `“${item.title}” langsung disembunyikan sambil file dibersihkan.`
    });
    try {
      await request(`/api/admin/media?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      notify("gallery");
      const successText = `“${item.title}” berhasil dihapus.`;
      setMessage({ text: successText, type: "success" });
      announce({ type: "success", title: "Memori dihapus", text: successText });
    } catch (error) {
      if (error.status === 401) onUnauthorized();
      else {
        await onDeleteFailed().catch(() => {});
        setMessage({ text: error.message, type: "error" });
        announce({ type: "error", title: "Gagal menghapus", text: error.message });
      }
    } finally {
      setDeletingId("");
    }
  }

  return (
    <section id="memory-library" className="admin-surface library-workspace">
      <PanelHeading
        eyebrow="Library"
        title="Memori tersimpan"
        action={<span className="library-count">{items.length} memori</span>}
      />
      <Message message={message} />
      {items.length ? (
        <div className="admin-library-list">
          {items.map((item) => {
            const media = getMemoryMedia(item);
            const cover = media[0] || item;
            return (
              <article className="library-row" key={item.id}>
                <div className="library-preview">
                  <MediaAsset media={cover} title={item.title} className="library-preview-media" />
                  {media.length > 1 && <span><Images /> {media.length}</span>}
                </div>
                <div className="library-copy">
                  <div className="library-badges">
                    <span>{cover?.type === "video" ? "Video" : "Photo"}</span>
                    {item.featured && <span className="featured-badge"><Sparkles /> Featured</span>}
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.description?.trim() || "Tanpa deskripsi"}</p>
                  <small>{formatDate(item.createdAt, true)}</small>
                </div>
                <div className="library-actions">
                  <button type="button" onClick={() => onEdit(item)} aria-label={`Edit ${item.title}`} title="Edit"><Pencil /><span>Edit</span></button>
                  <button className="danger-action" type="button" onClick={() => remove(item)} disabled={deletingId === item.id} aria-label={`Hapus ${item.title}`} title="Hapus">
                    {deletingId === item.id ? <LoaderCircle className="animate-spin" /> : <Trash2 />}<span>Hapus</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="admin-library-empty"><Images /><strong>Belum ada memori</strong><span>Memori pertama akan muncul di sini.</span></div>
      )}
    </section>
  );
}

function AdminHeader({ onLogout, loggingOut }) {
  return (
    <header className="admin-header">
      <Logo />
      <div className="admin-header-actions">
        <a href="/" aria-label="Buka galeri" title="Buka galeri"><ArrowUpRight /><span>Lihat galeri</span></a>
        <button type="button" onClick={onLogout} disabled={loggingOut} aria-label="Logout" title="Logout">
          {loggingOut ? <LoaderCircle className="animate-spin" /> : <LogOut />}<span>Logout</span>
        </button>
      </div>
    </header>
  );
}

function AdminSidebar() {
  const items = [
    ["#dashboard", "Overview", Sparkles],
    ["#music-settings", "Soundtrack", Music2],
    ["#memory-editor", "New memory", ImagePlus],
    ["#memory-library", "Library", Images]
  ];
  return (
    <aside className="admin-sidebar" aria-label="Navigasi admin">
      <p>Workspace</p>
      <nav>
        {items.map(([href, label, Icon], index) => (
          <a className={index === 0 ? "is-active" : ""} href={href} key={href}><Icon /><span>{label}</span></a>
        ))}
      </nav>
      <div className="sidebar-status"><i /><span><strong>Live sync</strong><small>Connected</small></span></div>
    </aside>
  );
}

export function AdminApp() {
  const [authenticated, setAuthenticated] = useState(null);
  const [gallery, setGallery] = useState([]);
  const [settings, setSettings] = useState({});
  const [editingItem, setEditingItem] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [toast, setToast] = useState(null);
  const editorRef = useRef(null);
  const syncChannel = useRef(null);

  const notify = useCallback((type) => {
    syncChannel.current?.postMessage({ type, updatedAt: Date.now() });
  }, []);

  const announce = useCallback((nextToast) => {
    setToast({ ...nextToast, id: `${Date.now()}-${Math.random()}` });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const handleMemorySaved = useCallback((saved) => {
    setGallery((current) => {
      const normalized = saved.featured
        ? current.map((item) => item.id === saved.id ? item : { ...item, featured: false })
        : current;
      const existingIndex = normalized.findIndex((item) => item.id === saved.id);
      if (existingIndex < 0) return [saved, ...normalized];
      return normalized.map((item) => item.id === saved.id ? saved : item);
    });
  }, []);

  const handleDeleteStarted = useCallback((id) => {
    setGallery((current) => current.filter((item) => item.id !== id));
    setEditingItem((current) => current?.id === id ? null : current);
  }, []);

  const loadWorkspace = useCallback(async () => {
    const [items, siteSettings] = await Promise.all([
      request("/api/gallery"),
      request("/api/site-config")
    ]);
    setGallery(Array.isArray(items) ? items : []);
    setSettings(siteSettings || {});
  }, []);

  const handleUnauthorized = useCallback(() => {
    setAuthenticated(false);
    setEditingItem(null);
    setToast(null);
  }, []);

  const enterWorkspace = useCallback(async () => {
    setAuthenticated(true);
    try {
      await loadWorkspace();
    } catch (error) {
      if (error.status === 401) handleUnauthorized();
      else throw error;
    }
  }, [handleUnauthorized, loadWorkspace]);

  useEffect(() => {
    syncChannel.current = createSyncChannel();
    request("/api/admin/session")
      .then(async (session) => {
        setAuthenticated(Boolean(session.authenticated));
        if (session.authenticated) await loadWorkspace();
      })
      .catch(() => setAuthenticated(false));
    return () => syncChannel.current?.close();
  }, [loadWorkspace]);

  async function logout() {
    setLoggingOut(true);
    try {
      await request("/api/admin/logout", { method: "POST", body: JSON.stringify({}) });
      handleUnauthorized();
    } finally {
      setLoggingOut(false);
    }
  }

  if (authenticated === null) {
    return <div className="admin-boot"><LoaderCircle className="animate-spin" /><span>Opening workspace</span></div>;
  }

  if (!authenticated) {
    return <LoginView onLogin={enterWorkspace} />;
  }

  const mediaCount = gallery.reduce((total, item) => total + Math.max(getMemoryMedia(item).length, 1), 0);
  const musicSource = getActiveMusicSource(settings);

  return (
    <div className="admin-app">
      <AdminToast toast={toast} onDismiss={dismissToast} />
      <AdminHeader onLogout={logout} loggingOut={loggingOut} />
      <div className="admin-frame">
        <AdminSidebar />
        <main className="admin-main">
          <section id="dashboard" className="admin-overview-modern">
            <div>
              <p>Content studio</p>
              <h1>Memory dashboard</h1>
              <span>Semua yang sedang hidup di Gallery of Us.</span>
            </div>
            <dl>
              <div><dt>Memori</dt><dd>{gallery.length}</dd></div>
              <div><dt>Media</dt><dd>{mediaCount}</dd></div>
              <div><dt>Soundtrack</dt><dd>{musicSource === "spotify" ? "Spotify" : musicSource === "audio" ? "Audio" : "Off"}</dd></div>
            </dl>
          </section>

          <div className="admin-work-grid">
            <MusicPanel
              settings={settings}
              onSaved={setSettings}
              onUnauthorized={handleUnauthorized}
              notify={notify}
            />
            <MemoryEditor
              editingItem={editingItem}
              onCancelEdit={() => setEditingItem(null)}
              onSaved={handleMemorySaved}
              onUnauthorized={handleUnauthorized}
              notify={notify}
              announce={announce}
              panelRef={editorRef}
            />
          </div>

          <MemoryLibrary
            items={gallery}
            onEdit={setEditingItem}
            onDeleteStarted={handleDeleteStarted}
            onDeleteFailed={loadWorkspace}
            onUnauthorized={handleUnauthorized}
            notify={notify}
            announce={announce}
          />
        </main>
      </div>
    </div>
  );
}
