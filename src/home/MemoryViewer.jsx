import { useEffect, useId, useRef } from "react";
import { ChevronLeft, ChevronRight, Heart, X } from "lucide-react";
import { MediaAsset } from "../components/MediaAsset";
import "./memory-viewer.css";

export function MemoryViewer({ item, onClose, onPrevious, onNext }) {
  const dialogRef = useRef(null);
  const headingId = useId();
  const counterId = useId();
  const hasMultipleMoments = item.mediaCount > 1;
  const mediaType = item.media?.type === "video" ? "Video" : "Foto";

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement;
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;

    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();

    return () => {
      if (dialog.open) dialog.close();
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  function handleBackdropClick(event) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (
      event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom
    ) onClose();
  }

  function handleKeyboard(event) {
    // Keep the page's chapter shortcuts from running behind the modal.
    event.stopPropagation();
    // Focused videos keep their native arrow-key seek/volume controls.
    if (!hasMultipleMoments || event.target.tagName === "VIDEO") return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onPrevious();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onNext();
    }
  }

  return (
    <dialog
      className="memory-viewer"
      ref={dialogRef}
      aria-labelledby={headingId}
      aria-describedby={counterId}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyboard}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="memory-viewer-shell">
        <header className="memory-viewer-header">
          <div className="memory-viewer-heading">
            <p>{mediaType} <span aria-hidden="true">·</span> our little archive</p>
            <h2 id={headingId}>{item.entry.title}</h2>
          </div>
          <button
            className="memory-viewer-close"
            type="button"
            onClick={onClose}
            aria-label="Tutup tampilan penuh"
            title="Tutup tampilan penuh"
            autoFocus
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="memory-viewer-stage">
          <MediaAsset
            key={`${item.entry.id}-${item.mediaIndex}`}
            media={item.media}
            title={item.entry.title}
            className="memory-viewer-media"
            videoControls
            eager
          />
        </div>

        <footer className={`memory-viewer-footer ${hasMultipleMoments ? "" : "is-single"}`}>
          {hasMultipleMoments && (
            <button
              className="memory-viewer-navigation"
              type="button"
              onClick={onPrevious}
              aria-label="Lihat momen sebelumnya"
              title="Momen sebelumnya"
            >
              <ChevronLeft aria-hidden="true" />
              <span>Sebelumnya</span>
            </button>
          )}
          <p className="memory-viewer-counter" id={counterId} aria-live="polite" aria-atomic="true">
            <Heart aria-hidden="true" />
            <span>Momen {item.mediaIndex + 1} dari {item.mediaCount}</span>
          </p>
          {hasMultipleMoments && (
            <button
              className="memory-viewer-navigation"
              type="button"
              onClick={onNext}
              aria-label="Lihat momen berikutnya"
              title="Momen berikutnya"
            >
              <span>Berikutnya</span>
              <ChevronRight aria-hidden="true" />
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}
