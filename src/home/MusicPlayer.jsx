import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Music2,
  Pause,
  Play,
  RotateCcw,
  X
} from "lucide-react";
import { getActiveMusicSource, getMediaSource, isDirectAudioUrl, formatPlaybackTime } from "../lib/media";

let spotifyApiPromise = null;

function loadSpotifyApi() {
  if (spotifyApiPromise) return spotifyApiPromise;
  spotifyApiPromise = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Spotify API timeout")), 10000);
    window.onSpotifyIframeApiReady = (api) => {
      window.clearTimeout(timeout);
      resolve(api);
    };

    if (document.querySelector('script[data-spotify-api="true"]')) return;
    const script = document.createElement("script");
    script.src = "https://open.spotify.com/embed/iframe-api/v1";
    script.async = true;
    script.dataset.spotifyApi = "true";
    script.addEventListener("error", () => {
      window.clearTimeout(timeout);
      reject(new Error("Spotify API unavailable"));
    }, { once: true });
    document.head.appendChild(script);
  });
  return spotifyApiPromise;
}

function ControlButton({ label, children, className = "", ...props }) {
  return (
    <button className={`player-icon-button ${className}`} type="button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

function PlayerArtwork({ source, title }) {
  if (!source) {
    return (
      <span className="player-artwork player-artwork-fallback" aria-hidden="true">
        <Music2 />
      </span>
    );
  }

  return <img className="player-artwork" src={source} alt="" />;
}

function SpotifyEmbed({ track }) {
  const mountRef = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let disposed = false;
    let controller = null;
    const readyTimeout = window.setTimeout(() => {
      if (!disposed) setStatus("failed");
    }, 7000);

    setStatus("loading");
    loadSpotifyApi()
      .then((api) => {
        if (disposed || !mountRef.current) return;
        api.createController(
          mountRef.current,
          { width: "100%", height: 80, uri: track.uri || `spotify:track:${track.id}` },
          (nextController) => {
            if (disposed) {
              nextController.destroy?.();
              return;
            }
            controller = nextController;
            nextController.addListener("ready", () => {
              if (disposed) return;
              window.clearTimeout(readyTimeout);
              setStatus("ready");
            });
          }
        );
      })
      .catch(() => {
        window.clearTimeout(readyTimeout);
        if (!disposed) setStatus("failed");
      });

    return () => {
      disposed = true;
      window.clearTimeout(readyTimeout);
      controller?.destroy?.();
      if (mountRef.current) mountRef.current.replaceChildren();
    };
  }, [track.id, track.uri]);

  return (
    <div className={`spotify-embed-stage is-${status}`}>
      <div className="spotify-embed-mount" ref={mountRef} />
      {status !== "ready" && (
        <p>{status === "failed" ? "Player diblokir browser ini. Gunakan tombol play hijau." : "Menyiapkan Spotify..."}</p>
      )}
    </div>
  );
}

function SpotifyPlayer({ track, onPrevious, onNext, hasMultiple }) {
  const spotifyUrl = track.url || `https://open.spotify.com/track/${track.id}`;
  const [showEmbed, setShowEmbed] = useState(false);

  return (
    <div className="spotify-dock">
      <div className="player-summary">
        <PlayerArtwork source={track.imageUrl} title={track.name} />
        <span className="player-track-copy min-w-0">
          <small>Playing from Spotify</small>
          <strong>{track.name}</strong>
          <span>{track.artist}</span>
        </span>
      </div>

      <div className="player-center-controls">
        {hasMultiple && (
          <ControlButton label="Memori sebelumnya" onClick={onPrevious}>
            <ChevronLeft />
          </ControlButton>
        )}
        <button
          className="player-main-action spotify-action"
          type="button"
          onClick={() => setShowEmbed((value) => !value)}
          aria-label={showEmbed ? "Tutup player Spotify" : `Putar ${track.name}`}
          title={showEmbed ? "Tutup player Spotify" : "Putar di sini"}
        >
          {showEmbed ? <X /> : <Play fill="currentColor" />}
        </button>
        {hasMultiple && (
          <ControlButton label="Memori berikutnya" onClick={onNext}>
            <ChevronRight />
          </ControlButton>
        )}
      </div>

      <a className="player-external-link" href={spotifyUrl} target="_blank" rel="noreferrer">
        <span>Spotify</span>
        <ExternalLink />
      </a>

      {showEmbed && <SpotifyEmbed track={track} />}
    </div>
  );
}

function AudioPlayer({ config, activeItem, onPrevious, onNext, hasMultiple }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [failed, setFailed] = useState(false);
  const musicUrl = config.musicUrl || "";
  const validMusic = isDirectAudioUrl(musicUrl);
  const mediaSource = activeItem?.media?.type === "image" ? getMediaSource(activeItem.media) : "";

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setFailed(false);
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.load();
  }, [musicUrl]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !validMusic || failed) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setFailed(true);
    }
  }

  function seek(value) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Number(value);
    setCurrentTime(Number(value));
  }

  const status = failed
    ? "Audio tidak tersedia"
    : !validMusic
      ? "Belum ada soundtrack"
      : playing
        ? "Now playing"
        : "Our soundtrack";

  return (
    <div className="audio-dock">
      <audio
        ref={audioRef}
        src={validMusic ? musicUrl : undefined}
        preload="none"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onError={() => validMusic && setFailed(true)}
      />

      <div className="player-summary">
        <PlayerArtwork source={mediaSource} title={activeItem?.entry?.title} />
        <span className="player-track-copy min-w-0">
          <small>{status}</small>
          <strong>{config.musicTitle || "Our favorite song"}</strong>
          <span>{activeItem?.entry?.title || "Gallery of Us"}</span>
        </span>
      </div>

      <div className="player-center-controls">
        {hasMultiple && (
          <ControlButton label="Memori sebelumnya" onClick={onPrevious}>
            <ChevronLeft />
          </ControlButton>
        )}
        <ControlButton
          label={playing ? "Jeda musik" : "Putar musik"}
          className="player-main-action"
          onClick={togglePlayback}
          disabled={!validMusic || failed}
        >
          {failed ? <RotateCcw /> : playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </ControlButton>
        {hasMultiple && (
          <ControlButton label="Memori berikutnya" onClick={onNext}>
            <ChevronRight />
          </ControlButton>
        )}
      </div>

      <div className="player-progress">
        <span>{formatPlaybackTime(currentTime)}</span>
        <input
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => seek(event.target.value)}
          disabled={!validMusic || failed}
          aria-label="Posisi lagu"
          style={{ "--player-progress": `${duration ? (currentTime / duration) * 100 : 0}%` }}
        />
        <span>{formatPlaybackTime(duration)}</span>
      </div>
    </div>
  );
}

export function MusicPlayer({ config = {}, activeItem, onPrevious, onNext, hasMultiple }) {
  const source = getActiveMusicSource(config);
  const spotifyTrack = useMemo(() => {
    const track = config.spotifyTrack;
    return track && /^[A-Za-z0-9]{22}$/.test(String(track.id || "")) ? track : null;
  }, [config.spotifyTrack]);

  if (source === "spotify" && spotifyTrack) {
    return (
      <SpotifyPlayer
        track={spotifyTrack}
        onPrevious={onPrevious}
        onNext={onNext}
        hasMultiple={hasMultiple}
      />
    );
  }

  return (
    <AudioPlayer
      config={config}
      activeItem={activeItem}
      onPrevious={onPrevious}
      onNext={onNext}
      hasMultiple={hasMultiple}
    />
  );
}
