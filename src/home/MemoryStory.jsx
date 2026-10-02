import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Heart } from "lucide-react";

export function MemoryStory({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const paragraphRef = useRef(null);
  const storyId = useId();
  const description = entry.description?.trim() || "Memori kecil yang tetap berarti.";

  useEffect(() => {
    const paragraph = paragraphRef.current;
    if (!paragraph || expanded) return;
    const measure = () => setHasMore(paragraph.scrollHeight > paragraph.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(paragraph);
    return () => observer.disconnect();
  }, [description, expanded]);

  return (
    <article className="active-story">
      <h2>Di balik momen ini <Heart aria-hidden="true" /></h2>
      <p ref={paragraphRef} id={storyId} className={expanded ? "is-expanded" : ""}>{description}</p>
      {hasMore && (
        <button className="story-read-more" type="button" aria-expanded={expanded} aria-controls={storyId} onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Tutup cerita" : "Baca cerita lengkap"}<ChevronDown aria-hidden="true" />
        </button>
      )}
      <span className="story-signature">with love, us <Heart fill="currentColor" /></span>
    </article>
  );
}
