import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Heart,
  Images,
  MapPin,
  MousePointerClick,
  Play,
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

const THREAD_PALETTES = [
  { accent: "#d8486d", soft: "#ffd5df" },
  { accent: "#397a5a", soft: "#c9f3d9" },
  { accent: "#3f75ad", soft: "#d8eaff" },
  { accent: "#9a6b12", soft: "#fff0ba" }
];

function formatThreadDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "our day";
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

function getThreadStops(items) {
  const seen = new Set();
  return items.reduce((stops, item, itemIndex) => {
    const id = item.entry.id;
    if (seen.has(id)) return stops;
    seen.add(id);
    stops.push({ item, itemIndex });
    return stops;
  }, []);
}

function MemoryThread({ items, activeIndex, select }) {
  const stops = getThreadStops(items);
  const activeId = items[activeIndex]?.entry.id;
  const activeStop = Math.max(0, stops.findIndex(({ item }) => item.entry.id === activeId));
  const activeThread = stops[activeStop];
  const visibleStart = Math.min(Math.max(activeStop - 3, 0), Math.max(stops.length - 8, 0));
  const visibleStops = stops.slice(visibleStart, visibleStart + 8).map((stop, index) => ({
    ...stop,
    stopIndex: visibleStart + index
  }));
  const progress = stops.length > 1 ? 12 + (activeStop / (stops.length - 1)) * 88 : 62;

  if (!stops.length) return null;

  return (
    <div className="memory-thread-scene">
      <svg className="memory-thread-line" viewBox="0 0 1000 760" preserveAspectRatio="none" aria-hidden="true">
        <path
          className="memory-thread-paper-gap"
          d="M70 145 C95 50 250 55 340 100 C420 140 420 225 325 260 C185 315 90 350 95 470 C100 600 230 680 365 645 C445 625 475 675 500 720 C525 675 555 625 635 645 C770 680 900 600 905 470 C910 350 815 315 675 260 C580 225 580 140 660 100 C750 55 905 50 930 145"
        />
        <path
          className="memory-thread-base"
          d="M70 145 C95 50 250 55 340 100 C420 140 420 225 325 260 C185 315 90 350 95 470 C100 600 230 680 365 645 C445 625 475 675 500 720 C525 675 555 625 635 645 C770 680 900 600 905 470 C910 350 815 315 675 260 C580 225 580 140 660 100 C750 55 905 50 930 145"
          pathLength="100"
        />
        <path
          className="memory-thread-progress"
          d="M70 145 C95 50 250 55 340 100 C420 140 420 225 325 260 C185 315 90 350 95 470 C100 600 230 680 365 645 C445 625 475 675 500 720 C525 675 555 625 635 645 C770 680 900 600 905 470 C910 350 815 315 675 260 C580 225 580 140 660 100 C750 55 905 50 930 145"
          pathLength="100"
          style={{ strokeDasharray: `${progress} 100` }}
        />
      </svg>

      <div className="memory-thread-stations" aria-label="Jalur kenangan kita">
        {visibleStops.map(({ item, itemIndex, stopIndex }, index) => {
          const isActive = item.entry.id === activeId;
          const side = index % 2 === 0 ? "left" : "right";
          return (
            <button
              className={`memory-thread-stop is-${side} ${isActive ? "is-active" : ""}`}
              key={item.entry.id}
              style={{ "--stop-row": Math.floor(index / 2), "--stop-tilt": `${side === "left" ? -4 + index : 4 - index}deg` }}
              type="button"
              onClick={() => select(itemIndex)}
              aria-label={`Buka memori ${item.entry.title}`}
              title={item.entry.title}
            >
              <span className="memory-thread-pin" aria-hidden="true">
                {isActive ? <Heart fill="currentColor" /> : String(stopIndex + 1).padStart(2, "0")}
              </span>
            </button>
          );
        })}
      </div>

      <span className="memory-thread-ticket" key={activeThread.item.entry.id} aria-hidden="true">
        <small><MapPin /> chapter {String(activeStop + 1).padStart(2, "0")}</small>
        <strong>{activeThread.item.entry.title}</strong>
        <span><Heart fill="currentColor" /> {formatThreadDate(activeThread.item.entry.createdAt)} / kept forever</span>
      </span>

      {stops.length > visibleStops.length && (
        <span className="memory-thread-more" aria-hidden="true">+{stops.length - visibleStops.length} more chapters</span>
      )}
      <span className="memory-thread-whisper" aria-hidden="true">still writing our story</span>
    </div>
  );
}

function MemoryStage({ items, activeIndex, direction, transitionMode, moveMoment, moveChapter }) {
  const active = items[activeIndex];
  const chapterStops = getThreadStops(items);
  const pointerStart = useRef(null);
  const suppressTap = useRef(false);

  if (!active) {
    return (
      <div className="home-empty-state">
        <Images />
        <h2>Belum ada memori</h2>
        <p>Foto pertama kita akan tampil manis di sini.</p>
      </div>
    );
  }

  const activeChapterIndex = Math.max(0, chapterStops.findIndex(({ item }) => item.entry.id === active.entry.id));
  const previousChapter = chapterStops[getCircularIndex(activeChapterIndex - 1, chapterStops.length)]?.item;
  const nextChapter = chapterStops[getCircularIndex(activeChapterIndex + 1, chapterStops.length)]?.item;
  const hasMultipleChapters = chapterStops.length > 1;
  const hasMultipleMoments = active.mediaCount > 1;

  function finishSwipe(clientX) {
    if (pointerStart.current === null) return;
    const distance = clientX - pointerStart.current;
    pointerStart.current = null;
    if (hasMultipleMoments && Math.abs(distance) > 48) {
      suppressTap.current = true;
      moveMoment(distance > 0 ? -1 : 1, "swipe");
      window.setTimeout(() => { suppressTap.current = false; }, 0);
    }
  }

  function tapNext() {
    if (suppressTap.current) {
      suppressTap.current = false;
      return;
    }
    moveMoment(1, "tap");
  }

  const MainMediaTag = hasMultipleMoments ? "button" : "div";

  return (
    <div
      className={`carousel-stage ${hasMultipleChapters ? "" : "is-single"}`}
      onPointerDown={(event) => {
        if (hasMultipleMoments && event.pointerType !== "mouse") pointerStart.current = event.clientX;
      }}
      onPointerUp={(event) => finishSwipe(event.clientX)}
      onPointerCancel={() => { pointerStart.current = null; }}
    >
      {hasMultipleChapters && (
        <button className="carousel-peek carousel-peek-left" type="button" onClick={() => moveChapter(-1)} aria-label="Chapter sebelumnya" title="Chapter sebelumnya">
          <span className="carousel-peek-visual" aria-hidden="true">
            <MediaAsset media={previousChapter.media} title={previousChapter.entry.title} className="carousel-peek-media" preloadVideo />
            {previousChapter.media?.type === "video" && <span className="carousel-peek-video"><Play fill="currentColor" /></span>}
          </span>
          <span className="carousel-peek-caption">
            <small>previous chapter</small>
            <strong>{previousChapter.entry.title}</strong>
          </span>
          <span className="carousel-peek-icon" aria-hidden="true"><Heart fill="currentColor" /></span>
        </button>
      )}

      <div className="carousel-focus">
        <div
          className={`carousel-active-media ${transitionMode === "tap" ? "tap-reveal" : direction > 0 ? "slide-forward" : "slide-backward"}`}
          key={`${active.entry.id}-${active.mediaIndex}`}
        >
          <span className="photo-tape photo-tape-left" aria-hidden="true" />
          <span className="photo-tape photo-tape-right" aria-hidden="true" />
          <MainMediaTag
            className={`carousel-tap-target ${hasMultipleMoments ? "is-tappable" : ""}`}
            {...(hasMultipleMoments ? {
              type: "button",
              onClick: tapNext,
              "aria-label": "Tampilkan momen berikutnya",
              title: "Tampilkan momen berikutnya"
            } : {})}
          >
            <MediaAsset media={active.media} title={active.entry.title} className="carousel-main-media" eager autoPlayVideo />
            {hasMultipleMoments && (
              <span className="carousel-tap-cue" aria-hidden="true">
                <span className="carousel-tap-cue-icon"><MousePointerClick /></span>
                <span className="carousel-tap-cue-copy">
                  <strong>tap foto</strong>
                  <small>lihat momen lainnya</small>
                </span>
              </span>
            )}
          </MainMediaTag>
          <div className="carousel-index" aria-live="polite">
            <Heart fill="currentColor" />
            <span>{String(active.mediaIndex + 1).padStart(2, "0")}</span>
            <i />
            <span>{String(active.mediaCount).padStart(2, "0")}</span>
          </div>
        </div>

        {hasMultipleChapters && (
          <>
            <button
              className="carousel-arrow carousel-arrow-left"
              type="button"
              onClick={() => moveChapter(-1)}
              aria-label="Chapter sebelumnya"
              title="Chapter sebelumnya"
            >
              <ChevronLeft />
            </button>
            <button
              className="carousel-arrow carousel-arrow-right"
              type="button"
              onClick={() => moveChapter(1)}
              aria-label="Chapter berikutnya"
              title="Chapter berikutnya"
            >
              <ChevronRight />
            </button>
          </>
        )}
      </div>

      {hasMultipleChapters && (
        <button className="carousel-peek carousel-peek-right" type="button" onClick={() => moveChapter(1)} aria-label="Chapter berikutnya" title="Chapter berikutnya">
          <span className="carousel-peek-visual" aria-hidden="true">
            <MediaAsset media={nextChapter.media} title={nextChapter.entry.title} className="carousel-peek-media" preloadVideo />
            {nextChapter.media?.type === "video" && <span className="carousel-peek-video"><Play fill="currentColor" /></span>}
          </span>
          <span className="carousel-peek-caption">
            <small>next chapter</small>
            <strong>{nextChapter.entry.title}</strong>
          </span>
          <span className="carousel-peek-icon" aria-hidden="true"><Sparkles /></span>
        </button>
      )}
    </div>
  );
}

function MemoryDots({ items, activeIndex, select }) {
  const active = items[activeIndex];
  if (!active || active.mediaCount < 2) return null;
  const firstMomentIndex = activeIndex - active.mediaIndex;
  const moments = items.slice(firstMomentIndex, firstMomentIndex + active.mediaCount);

  return (
    <div className="memory-dots" aria-label={`Pilih momen dari ${active.entry.title}`}>
      {moments.map((item, momentIndex) => {
        const itemIndex = firstMomentIndex + momentIndex;
        return (
          <button
            className={itemIndex === activeIndex ? "is-active" : ""}
            key={`${item.entry.id}-${item.mediaIndex}`}
            type="button"
            onClick={() => select(itemIndex)}
            aria-label={`Buka momen ${momentIndex + 1}`}
            title={`Momen ${momentIndex + 1}`}
          >
            <Heart fill={itemIndex === activeIndex ? "currentColor" : "none"} />
          </button>
        );
      })}
    </div>
  );
}

export function HomeApp() {
  const mainRef = useRef(null);
  const [memories, setMemories] = useState([]);
  const [config, setConfig] = useState({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [transitionMode, setTransitionMode] = useState("navigation");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const carouselItems = useMemo(() => flattenMemories(memories), [memories]);
  const chapterStops = useMemo(() => getThreadStops(carouselItems), [carouselItems]);
  const active = carouselItems[activeIndex];
  const activeThreadStop = useMemo(() => {
    return Math.max(0, chapterStops.findIndex(({ item }) => item.entry.id === active?.entry.id));
  }, [active?.entry.id, chapterStops]);
  const threadPalette = THREAD_PALETTES[activeThreadStop % THREAD_PALETTES.length];

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

  const moveMoment = useCallback((step, source = "tap") => {
    const current = carouselItems[activeIndex];
    if (!current || current.mediaCount < 2) return;
    setTransitionMode(source);
    setDirection(step > 0 ? 1 : -1);
    const firstMomentIndex = activeIndex - current.mediaIndex;
    const nextMomentIndex = getCircularIndex(current.mediaIndex + step, current.mediaCount);
    setActiveIndex(firstMomentIndex + nextMomentIndex);
  }, [activeIndex, carouselItems]);

  const moveChapter = useCallback((step) => {
    if (chapterStops.length < 2) return;
    const currentChapterIndex = Math.max(
      0,
      chapterStops.findIndex(({ item }) => item.entry.id === carouselItems[activeIndex]?.entry.id)
    );
    const targetChapter = chapterStops[getCircularIndex(currentChapterIndex + step, chapterStops.length)];
    if (!targetChapter) return;
    setTransitionMode("navigation");
    setDirection(step > 0 ? 1 : -1);
    setActiveIndex(targetChapter.itemIndex);
  }, [activeIndex, carouselItems, chapterStops]);

  const selectMemory = useCallback((index) => {
    const staysInChapter = carouselItems[index]?.entry.id === carouselItems[activeIndex]?.entry.id;
    setTransitionMode(staysInChapter ? "tap" : "navigation");
    setDirection(index >= activeIndex ? 1 : -1);
    setActiveIndex(index);
  }, [activeIndex, carouselItems]);

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
      if ((event.ctrlKey || event.metaKey) && event.altKey && !event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        openAdmin();
        return;
      }
      if (event.target.closest?.("button, input, textarea, select, a")) return;
      if (event.key === "ArrowLeft") moveChapter(-1);
      if (event.key === "ArrowRight") moveChapter(1);
    }
    document.addEventListener("keydown", handleKeyboard);
    return () => document.removeEventListener("keydown", handleKeyboard);
  }, [moveChapter]);

  const description = active?.entry?.description?.trim() || "Memori kecil yang tetap berarti.";
  const activeType = active?.media?.type === "video" ? "Video" : "Photo";

  function moveThreadWithPointer(event) {
    if (event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 8;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 6;
    event.currentTarget.style.setProperty("--thread-shift-x", `${x.toFixed(2)}px`);
    event.currentTarget.style.setProperty("--thread-shift-y", `${y.toFixed(2)}px`);
  }

  function resetThreadPosition(event) {
    event.currentTarget.style.setProperty("--thread-shift-x", "0px");
    event.currentTarget.style.setProperty("--thread-shift-y", "0px");
  }

  return (
    <div className="home-app cute-home">
      <header className="home-header">
        <Logo />
        <p className="header-love-note"><Heart fill="currentColor" /> for us, always</p>
      </header>

      <main
        className="scrapbook-main"
        ref={mainRef}
        style={{ "--thread-accent": threadPalette.accent, "--thread-soft": threadPalette.soft }}
        onPointerMove={moveThreadWithPointer}
        onPointerLeave={resetThreadPosition}
      >
        <MemoryThread items={carouselItems} activeIndex={activeIndex} select={selectMemory} />
        <span className="cute-sticker sticker-you" aria-hidden="true">you + me</span>
        <span className="cute-sticker sticker-sparkle" aria-hidden="true"><Sparkles /></span>

        <div className="scrapbook-intro">
          <p><Sparkles /> Our little archive</p>
          <span>{memories.length} {memories.length === 1 ? "sweet chapter" : "sweet chapters"}</span>
        </div>

        {loading ? (
          <div className="home-loading"><RefreshCw className="animate-spin" /><span>Menyiapkan kenangan kita</span></div>
        ) : error && !carouselItems.length ? (
          <div className="home-error"><strong>Koneksi terputus</strong><span>{error}</span><button type="button" onClick={loadData}>Coba lagi</button></div>
        ) : (
          <>
            <MemoryStage
              items={carouselItems}
              activeIndex={activeIndex}
              direction={direction}
              transitionMode={transitionMode}
              moveMoment={moveMoment}
              moveChapter={moveChapter}
            />

            <div className="center-player-wrap">
              <MusicPlayer
                config={config}
                activeItem={active}
                onPrevious={() => moveChapter(-1)}
                onNext={() => moveChapter(1)}
                hasMultiple={chapterStops.length > 1}
              />
            </div>

            <MemoryDots items={carouselItems} activeIndex={activeIndex} select={selectMemory} />

            {active && (
              <article className="active-story" key={active.entry.id}>
                <div className="active-story-meta">
                  <span>{active.entry.featured ? "Our favorite" : activeType}</span>
                  <i />
                  <span><CalendarDays /> {formatDate(active.entry.createdAt)}</span>
                  {active.mediaCount > 1 && <><i /><span><Images /> moment {active.mediaIndex + 1}/{active.mediaCount}</span></>}
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
