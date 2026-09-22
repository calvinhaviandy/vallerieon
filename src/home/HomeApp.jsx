import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Heart,
  Images,
  RefreshCw,
  Sparkles
} from "lucide-react";
import { Logo } from "../components/Logo";
import { MediaAsset } from "../components/MediaAsset";
import { createSyncChannel, request } from "../lib/api";
import { flattenMemories, formatDate } from "../lib/media";
import { MusicPlayer } from "./MusicPlayer";

function getCircularIndex(index, length) {
  if (!length) return 0;
  return (index + length) % length;
}

function MemoryStage({ items, activeIndex, direction, move }) {
  const active = items[activeIndex];
  const previous = items[getCircularIndex(activeIndex - 1, items.length)];
  const next = items[getCircularIndex(activeIndex + 1, items.length)];
  const pointerStart = useRef(null);

  if (!active) {
    return (
      <div className="home-empty-state">
        <Images />
        <h2>Belum ada memori</h2>
        <p>Foto pertama kita akan tampil manis di sini.</p>
      </div>
    );
  }

  function finishSwipe(clientX) {
    if (pointerStart.current === null) return;
    const distance = clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(distance) > 48) move(distance > 0 ? -1 : 1);
  }

  return (
    <div
      className="carousel-stage"
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse") pointerStart.current = event.clientX;
      }}
      onPointerUp={(event) => finishSwipe(event.clientX)}
      onPointerCancel={() => { pointerStart.current = null; }}
    >
      {items.length > 1 && (
        <button className="carousel-peek carousel-peek-left" type="button" onClick={() => move(-1)} aria-label="Memori sebelumnya" title="Memori sebelumnya">
          <small>previous</small>
          <strong>{previous.entry.title}</strong>
          <span aria-hidden="true"><Heart fill="currentColor" /></span>
        </button>
      )}

      <div className="carousel-focus">
        <div
          className={`carousel-active-media ${direction > 0 ? "slide-forward" : "slide-backward"}`}
          key={`${active.entry.id}-${active.mediaIndex}`}
        >
          <span className="photo-tape photo-tape-left" aria-hidden="true" />
          <span className="photo-tape photo-tape-right" aria-hidden="true" />
          <MediaAsset media={active.media} title={active.entry.title} className="carousel-main-media" eager autoPlayVideo />
          <div className="carousel-index" aria-live="polite">
            <Heart fill="currentColor" />
            <span>{String(activeIndex + 1).padStart(2, "0")}</span>
            <i />
            <span>{String(items.length).padStart(2, "0")}</span>
          </div>
        </div>

        <button className="carousel-arrow carousel-arrow-left" type="button" onClick={() => move(-1)} disabled={items.length < 2} aria-label="Memori sebelumnya" title="Memori sebelumnya">
          <ChevronLeft />
        </button>
        <button className="carousel-arrow carousel-arrow-right" type="button" onClick={() => move(1)} disabled={items.length < 2} aria-label="Memori berikutnya" title="Memori berikutnya">
          <ChevronRight />
        </button>
      </div>

      {items.length > 1 && (
        <button className="carousel-peek carousel-peek-right" type="button" onClick={() => move(1)} aria-label="Memori berikutnya" title="Memori berikutnya">
          <small>next</small>
          <strong>{next.entry.title}</strong>
          <span aria-hidden="true"><Sparkles /></span>
        </button>
      )}
    </div>
  );
}

function MemoryDots({ items, activeIndex, select }) {
  if (items.length < 2) return null;
  return (
    <div className="memory-dots" aria-label="Pilih memori">
      {items.map((item, index) => (
        <button
          className={index === activeIndex ? "is-active" : ""}
          key={`${item.entry.id}-${item.mediaIndex}`}
          type="button"
          onClick={() => select(index)}
          aria-label={`Buka ${item.entry.title}`}
          title={item.entry.title}
        >
          <Heart fill={index === activeIndex ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

export function HomeApp() {
  const [memories, setMemories] = useState([]);
  const [config, setConfig] = useState({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const carouselItems = useMemo(() => flattenMemories(memories), [memories]);
  const active = carouselItems[activeIndex];

  const loadData = useCallback(async () => {
    try {
      const [gallery, settings] = await Promise.all([
        request("/api/gallery"),
        request("/api/site-config")
      ]);
      if (!Array.isArray(gallery)) throw new Error("Format galeri tidak valid.");
      setMemories(gallery);
      setConfig(settings || {});
      setError("");
    } catch (loadError) {
      setError(loadError.message || "Galeri belum bisa dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const channel = createSyncChannel();
    channel?.addEventListener("message", loadData);
    return () => channel?.close();
  }, [loadData]);

  useEffect(() => {
    if (!carouselItems.length) return;
    const featuredIndex = carouselItems.findIndex((item) => item.entry.featured);
    setActiveIndex(featuredIndex >= 0 ? featuredIndex : 0);
  }, [carouselItems.length]);

  const move = useCallback((step) => {
    if (carouselItems.length < 2) return;
    setDirection(step > 0 ? 1 : -1);
    setActiveIndex((current) => getCircularIndex(current + step, carouselItems.length));
  }, [carouselItems.length]);

  const selectMemory = useCallback((index) => {
    setDirection(index >= activeIndex ? 1 : -1);
    setActiveIndex(index);
  }, [activeIndex]);

  async function openAdmin() {
    try {
      await request("/api/admin/shortcut", { method: "POST" });
      window.location.href = "/admin.html";
    } catch {
      setError("Panel admin belum bisa dibuka.");
    }
  }

  useEffect(() => {
    function handleKeyboard(event) {
      if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        openAdmin();
        return;
      }
      if (event.target.closest?.("button, input, textarea, select, a")) return;
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    }
    document.addEventListener("keydown", handleKeyboard);
    return () => document.removeEventListener("keydown", handleKeyboard);
  }, [move]);

  const description = active?.entry?.description?.trim() || "Memori kecil yang tetap berarti.";
  const activeType = active?.media?.type === "video" ? "Video" : "Photo";

  return (
    <div className="home-app cute-home">
      <header className="home-header">
        <Logo />
        <p className="header-love-note"><Heart fill="currentColor" /> for us, always</p>
      </header>

      <main className="scrapbook-main">
        <span className="cute-sticker sticker-you" aria-hidden="true">you + me</span>
        <span className="cute-sticker sticker-love" aria-hidden="true"><Heart fill="currentColor" /></span>
        <span className="cute-sticker sticker-sparkle" aria-hidden="true"><Sparkles /></span>

        <div className="scrapbook-intro">
          <p><Sparkles /> Our little archive</p>
          <span>{memories.length} sweet memories</span>
        </div>

        {loading ? (
          <div className="home-loading"><RefreshCw className="animate-spin" /><span>Menyiapkan kenangan kita</span></div>
        ) : error && !carouselItems.length ? (
          <div className="home-error"><strong>Koneksi terputus</strong><span>{error}</span><button type="button" onClick={loadData}>Coba lagi</button></div>
        ) : (
          <>
            <MemoryStage items={carouselItems} activeIndex={activeIndex} direction={direction} move={move} />

            <div className="center-player-wrap">
              <MusicPlayer
                config={config}
                activeItem={active}
                onPrevious={() => move(-1)}
                onNext={() => move(1)}
                hasMultiple={carouselItems.length > 1}
              />
            </div>

            <MemoryDots items={carouselItems} activeIndex={activeIndex} select={selectMemory} />

            {active && (
              <article className="active-story" key={active.entry.id}>
                <div className="active-story-meta">
                  <span>{active.entry.featured ? "Our favorite" : activeType}</span>
                  <i />
                  <span><CalendarDays /> {formatDate(active.entry.createdAt)}</span>
                  {active.mediaCount > 1 && <><i /><span>{active.mediaIndex + 1}/{active.mediaCount}</span></>}
                </div>
                <h1>{active.entry.title}</h1>
                <p>{description}</p>
                <span className="story-signature">with love, us <Heart fill="currentColor" /></span>
              </article>
            )}
          </>
        )}
      </main>

      <footer className="cute-footer">
        <span><Heart fill="currentColor" /> Gallery of Us</span>
        <span>{new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
