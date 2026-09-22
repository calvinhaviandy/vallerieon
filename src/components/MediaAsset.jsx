import { useState } from "react";
import { ImageOff } from "lucide-react";
import { getMediaSource } from "../lib/media";

export function MediaAsset({
  media,
  title,
  className = "",
  videoControls = false,
  eager = false,
  autoPlayVideo = false
}) {
  const [failed, setFailed] = useState(false);
  const source = getMediaSource(media);

  if (!source || failed) {
    return (
      <div className={`media-missing ${className}`} role="img" aria-label={`Media ${title} tidak tersedia`}>
        <ImageOff aria-hidden="true" />
        <span>Media tidak tersedia</span>
      </div>
    );
  }

  if (media?.type === "video") {
    return (
      <video
        className={className}
        src={source}
        controls={videoControls}
        muted={autoPlayVideo && !videoControls}
        loop={autoPlayVideo && !videoControls}
        autoPlay={autoPlayVideo && !videoControls}
        playsInline
        preload={autoPlayVideo || videoControls ? "metadata" : "none"}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <img
      className={className}
      src={source}
      alt={title}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      decoding="async"
      draggable="false"
      onError={() => setFailed(true)}
    />
  );
}
