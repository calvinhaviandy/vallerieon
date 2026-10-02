import { ChevronDown, Images } from "lucide-react";
import { MediaAsset } from "../components/MediaAsset";
import { formatDate } from "../lib/media";
import "./chapter-picker.css";

export function ChapterPicker({ stops = [], activeId, onSelect }) {
  const chapters = Array.isArray(stops) ? stops.filter((stop) => stop?.item?.entry) : [];
  if (!chapters.length) return null;

  const activeChapter = Math.max(0, chapters.findIndex(({ item }) => item.entry.id === activeId));
  const position = String(activeChapter + 1).padStart(2, "0");
  const total = String(chapters.length).padStart(2, "0");

  return (
    <details className="chapter-picker">
      <summary className="chapter-picker-toggle">
        <span className="chapter-picker-toggle-copy">
          <Images aria-hidden="true" />
          <span className="chapter-picker-label-closed">Lihat semua kenangan</span>
          <span className="chapter-picker-label-open">Tutup daftar kenangan</span>
        </span>
        <span className="chapter-picker-position">Chapter {position} / {total}</span>
        <ChevronDown className="chapter-picker-chevron" aria-hidden="true" />
      </summary>

      <nav className="chapter-picker-list" aria-label="Pilih chapter kenangan">
        {chapters.map(({ item, itemIndex }, index) => {
          const entry = item.entry;
          const isActive = entry.id === activeId;
          return (
            <button
              className={`chapter-picker-card ${isActive ? "is-active" : ""}`}
              key={entry.id}
              type="button"
              aria-current={isActive ? "true" : undefined}
              onClick={() => onSelect?.(itemIndex)}
              title={entry.title}
            >
              <span className="chapter-picker-thumbnail" aria-hidden="true">
                <MediaAsset media={item.media} title={entry.title} className="chapter-picker-media" />
                <span className="chapter-picker-number">{String(index + 1).padStart(2, "0")}</span>
              </span>
              <span className="chapter-picker-card-copy">
                <strong>{entry.title || "Kenangan kita"}</strong>
                <span>{formatDate(entry.createdAt)}</span>
                {isActive && <small>Sedang dibuka</small>}
              </span>
            </button>
          );
        })}
      </nav>
    </details>
  );
}
