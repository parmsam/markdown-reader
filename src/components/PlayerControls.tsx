import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState, useRef } from "react";
import type { PlayerStatus } from "../hooks/usePlayer";

interface VoiceInfo {
  id: string;
  name: string;
  language: string;
}

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

interface Props {
  status: PlayerStatus;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onSetSpeed: (speed: number) => void;
  onSetVoice: (voice: string) => void;
}

export function PlayerControls({
  status,
  onPlay,
  onPause,
  onResume,
  onStop,
  onSkipBack,
  onSkipForward,
  onSetSpeed,
  onSetVoice,
}: Props) {
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [showVoices, setShowVoices] = useState(false);
  const voiceMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<VoiceInfo[]>("list_voices").then(setVoices).catch(console.error);
  }, []);

  // Close voice menu on outside click
  useEffect(() => {
    if (!showVoices) return;
    const handler = (e: MouseEvent) => {
      if (voiceMenuRef.current && !voiceMenuRef.current.contains(e.target as Node)) {
        setShowVoices(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showVoices]);

  const isPlaying = status.state === "playing" || status.state === "loading";
  const isLoading = status.state === "loading";
  const hasContent = status.totalSegments > 0;
  const progress =
    status.totalSegments > 0 && status.currentSegment >= 0
      ? ((status.currentSegment + 1) / status.totalSegments) * 100
      : 0;

  const handlePlayPause = () => {
    if (isPlaying) onPause();
    else if (status.state === "paused") onResume();
    else onPlay();
  };

  const currentVoiceName = voices.find((v) => v.id === status.voice)?.name ?? status.voice;

  return (
    <div
      className="player-fade fixed bottom-0 left-0 right-0 pt-16 pb-5 px-6 pointer-events-none"
    >
      <div
        className="pointer-events-auto max-w-[680px] mx-auto rounded-2xl px-5 py-3.5"
        style={{
          background: "var(--player-bg)",
          border: "1px solid var(--border)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "0 4px 24px -4px rgba(0,0,0,0.12)",
        }}
      >
        {/* Progress bar */}
        <div className="mb-3">
          <div
            className="h-0.5 rounded-full overflow-hidden"
            style={{ background: "var(--border)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: "var(--accent)",
              }}
            />
          </div>
          {status.currentSegment >= 0 && (
            <div
              className="text-[10px] mt-1 text-center tabular-nums"
              style={{ color: "var(--text-faint)" }}
            >
              {status.currentSegment + 1} / {status.totalSegments}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-3">
          {/* Speed */}
          <div className="flex items-center gap-0.5">
            {SPEEDS.map((s) => {
              const isActive = status.speed === s;
              return (
                <button
                  key={s}
                  onClick={() => onSetSpeed(s)}
                  className="px-1.5 py-1 rounded text-[11px] font-mono font-medium transition-all duration-100"
                  style={{
                    color: isActive ? "white" : "var(--text-muted)",
                    background: isActive ? "var(--accent)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  {s === 1.0 ? "1×" : `${s}×`}
                </button>
              );
            })}
          </div>

          {/* Transport */}
          <div className="flex items-center gap-2.5">
            <TransportBtn
              onClick={onStop}
              disabled={!hasContent || status.state === "idle"}
              title="Stop"
            >
              <StopIcon />
            </TransportBtn>

            <TransportBtn onClick={onSkipBack} disabled={!hasContent} title="Previous sentence">
              <SkipBackIcon />
            </TransportBtn>

            <button
              onClick={handlePlayPause}
              disabled={!hasContent}
              title={isPlaying ? "Pause" : "Play"}
              className="w-12 h-12 flex items-center justify-center rounded-full transition-all duration-100 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: "var(--accent)",
                color: "white",
                boxShadow: "0 2px 12px -2px rgba(0,0,0,0.25)",
              }}
              onMouseEnter={(e) => {
                if (hasContent) (e.currentTarget as HTMLElement).style.filter = "brightness(1.1)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.filter = "";
              }}
            >
              {isLoading ? <SpinnerIcon /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>

            <TransportBtn onClick={onSkipForward} disabled={!hasContent} title="Next sentence">
              <SkipForwardIcon />
            </TransportBtn>

            <div className="w-6" />
          </div>

          {/* Voice picker */}
          <div className="relative" ref={voiceMenuRef}>
            <button
              onClick={() => setShowVoices((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-100"
              style={{
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                background: "transparent",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <span style={{ fontSize: 13 }}>🗣</span>
              <span className="max-w-20 truncate font-medium">{currentVoiceName}</span>
              <ChevronIcon />
            </button>

            {showVoices && (
              <div
                className="absolute bottom-full right-0 mb-2 rounded-xl overflow-hidden min-w-44 z-50"
                style={{
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border)",
                  boxShadow: "0 8px 32px -4px rgba(0,0,0,0.18)",
                }}
              >
                {voices.map((v) => {
                  const isActive = v.id === status.voice;
                  return (
                    <button
                      key={v.id}
                      onClick={() => {
                        onSetVoice(v.id);
                        setShowVoices(false);
                      }}
                      className="w-full text-left px-3.5 py-2.5 text-sm transition-colors duration-100"
                      style={{
                        background: isActive ? "var(--accent-bg)" : "transparent",
                        color: isActive ? "var(--accent)" : "var(--text)",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive)
                          (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive)
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <div className="font-medium">{v.name}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                        {v.language}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TransportBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-100 disabled:opacity-25 disabled:cursor-not-allowed"
      style={{ color: "var(--text-muted)" }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
          (e.currentTarget as HTMLElement).style.color = "var(--text)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
        (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
      }}
    >
      {children}
    </button>
  );
}

// ── Icons ──────────────────────────────────────────────────────
function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="6,3 20,12 6,21" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
    </svg>
  );
}
function SkipBackIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="18,5 9,12 18,19" />
      <rect x="5" y="5" width="3" height="14" rx="1" />
    </svg>
  );
}
function SkipForwardIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="6,5 15,12 6,19" />
      <rect x="16" y="5" width="3" height="14" rx="1" />
    </svg>
  );
}
function SpinnerIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className="animate-spin"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
