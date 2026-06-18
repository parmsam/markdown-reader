import { useState, useCallback, useEffect, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { PasteModal } from "./components/PasteModal";
import { MarkdownViewer } from "./components/MarkdownViewer";
import { PlayerControls } from "./components/PlayerControls";
import { TableOfContents } from "./components/TableOfContents";
import { usePlayer } from "./hooks/usePlayer";
import { segmentMarkdown, extractToc } from "./lib/textSegmenter";

interface Document {
  markdown: string;
  title: string;
}

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < Math.min(s.length, 500); i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function docKey(markdown: string) {
  return `mr-p-${simpleHash(markdown)}-${markdown.length}`;
}

export default function App() {
  const [doc, setDoc] = useState<Document | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [converting, setConverting] = useState(false);
  const [resumePrompt, setResumePrompt] = useState<number | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const segments = useMemo(() => (doc ? segmentMarkdown(doc.markdown) : []), [doc]);
  const toc = useMemo(() => (doc ? extractToc(doc.markdown) : []), [doc]);

  const { status, play, pause, resume, stop, skipBack, skipForward, jumpTo, setSpeed, setVoice } =
    usePlayer(segments);

  // Save reading progress whenever the segment changes
  useEffect(() => {
    if (!doc || status.currentSegment < 0) return;
    localStorage.setItem(docKey(doc.markdown), String(status.currentSegment));
  }, [doc, status.currentSegment]);

  // Keyboard shortcuts: Space=play/pause, ←/→=skip, [/]=speed
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      switch (e.key) {
        case " ":
          if (!doc) return;
          e.preventDefault();
          if (status.state === "playing" || status.state === "loading") pause();
          else if (status.state === "paused") resume();
          else play();
          break;
        case "ArrowLeft":
          if (!doc || e.metaKey) return;
          e.preventDefault();
          skipBack();
          break;
        case "ArrowRight":
          if (!doc || e.metaKey) return;
          e.preventDefault();
          skipForward();
          break;
        case "[": {
          const idx = SPEEDS.indexOf(status.speed);
          if (idx > 0) setSpeed(SPEEDS[idx - 1]);
          break;
        }
        case "]": {
          const idx = SPEEDS.indexOf(status.speed);
          if (idx < SPEEDS.length - 1) setSpeed(SPEEDS[idx + 1]);
          break;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doc, status.state, status.speed, play, pause, resume, skipBack, skipForward, setSpeed]);

  const openDocument = useCallback(
    (markdown: string, title?: string) => {
      setDoc({ markdown, title: title ?? "Document" });
      stop();
      const saved = localStorage.getItem(docKey(markdown));
      const seg = saved !== null ? parseInt(saved, 10) : NaN;
      setResumePrompt(!isNaN(seg) && seg > 0 ? seg : null);
    },
    [stop]
  );

  const handleOpenFile = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Documents", extensions: ["md", "markdown", "pdf", "txt"] }],
    }).catch(() => null);

    if (!selected || typeof selected !== "string") return;
    const path = selected as string;
    const filename = path.split("/").pop() ?? "Document";

    if (path.toLowerCase().endsWith(".pdf")) {
      setConverting(true);
      try {
        const md = await invoke<string>("convert_pdf", { path });
        openDocument(md, filename.replace(/\.pdf$/i, ""));
      } catch (e) {
        alert(`PDF conversion failed: ${e}`);
      } finally {
        setConverting(false);
      }
    } else {
      const content = await invoke<string>("read_file", { path }).catch((e) => {
        alert(`Failed to read: ${e}`);
        return null;
      });
      if (content) openDocument(content, filename.replace(/\.(md|markdown|txt)$/i, ""));
    }
  }, [openDocument]);

  // Drag-and-drop
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      const path = (file as File & { path?: string }).path;
      if (!path) return;
      const name = file.name;

      if (name.toLowerCase().endsWith(".pdf")) {
        setConverting(true);
        try {
          const md = await invoke<string>("convert_pdf", { path });
          openDocument(md, name.replace(/\.pdf$/i, ""));
        } catch (e) {
          alert(`PDF conversion failed: ${e}`);
        } finally {
          setConverting(false);
        }
      } else {
        const content = await invoke<string>("read_file", { path }).catch(() => null);
        if (content) openDocument(content, name.replace(/\.(md|markdown|txt)$/i, ""));
      }
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [openDocument]);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Toolbar */}
      <header
        className="flex items-center gap-2 px-4 py-2 shrink-0 z-10"
        style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2.5 mr-1">
          <BookIcon />
          <span className="font-semibold text-sm truncate max-w-64" style={{ color: "var(--text)" }}>
            {doc?.title ?? "Markdown Reader"}
          </span>
          {appVersion && (
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{ color: "var(--text-faint)", background: "var(--bg-subtle)", border: "1px solid var(--border-soft)" }}
            >
              v{appVersion}
            </span>
          )}
        </div>

        <div className="flex-1" />

        {doc && (
          <IconBtn
            onClick={() => setShowSidebar((v) => !v)}
            title={showSidebar ? "Hide sidebar" : "Show sidebar"}
            active={showSidebar}
          >
            <SidebarIcon />
          </IconBtn>
        )}

        <IconBtn onClick={() => setDark((d) => !d)} title={dark ? "Light mode" : "Dark mode"}>
          {dark ? <SunIcon /> : <MoonIcon />}
        </IconBtn>

        <div className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />

        <ToolbarBtn onClick={handleOpenFile} icon="📂">Open</ToolbarBtn>
        <ToolbarBtn onClick={() => setShowPaste(true)} icon="📋">Paste</ToolbarBtn>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {doc && showSidebar && (
          <aside
            className="w-56 shrink-0 overflow-hidden flex flex-col"
            style={{ background: "var(--bg-subtle)", borderRight: "1px solid var(--border)" }}
          >
            <TableOfContents toc={toc} currentSegment={status.currentSegment} onJump={jumpTo} />
          </aside>
        )}

        <main className="flex-1 overflow-hidden relative">
          {converting ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-5xl mb-5">📄</div>
                <p className="font-medium" style={{ color: "var(--text)" }}>Converting PDF…</p>
                <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>This may take a moment</p>
              </div>
            </div>
          ) : doc ? (
            <>
              {/* Resume banner */}
              {resumePrompt !== null && status.state === "idle" && (
                <div className="absolute top-3 left-0 right-0 flex justify-center z-20 pointer-events-none">
                  <div
                    className="flex items-center gap-3 px-4 py-2 rounded-full text-sm pointer-events-auto"
                    style={{
                      background: "var(--bg-raised)",
                      border: "1px solid var(--border)",
                      boxShadow: "0 4px 16px -4px rgba(0,0,0,0.15)",
                      color: "var(--text-muted)",
                    }}
                  >
                    <span>Continue from where you left off?</span>
                    <button
                      onClick={() => { jumpTo(resumePrompt); setResumePrompt(null); }}
                      className="font-medium text-xs px-2.5 py-1 rounded-lg"
                      style={{ background: "var(--accent)", color: "white" }}
                    >
                      Resume
                    </button>
                    <button
                      onClick={() => setResumePrompt(null)}
                      className="text-xs"
                      style={{ color: "var(--text-faint)" }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              <MarkdownViewer
                markdown={doc.markdown}
                segments={segments}
                currentSegment={status.currentSegment}
                currentWord={status.currentWord}
                onClickSegment={jumpTo}
              />
            </>
          ) : (
            <WelcomeScreen onMarkdown={openDocument} onPaste={() => setShowPaste(true)} version={appVersion} />
          )}

          {doc && (
            <PlayerControls
              status={status}
              onPlay={() => play()}
              onPause={pause}
              onResume={resume}
              onStop={stop}
              onSkipBack={skipBack}
              onSkipForward={skipForward}
              onSetSpeed={setSpeed}
              onSetVoice={setVoice}
            />
          )}
        </main>
      </div>

      {showPaste && (
        <PasteModal
          onSubmit={(md, title) => { openDocument(md, title); setShowPaste(false); }}
          onClose={() => setShowPaste(false)}
        />
      )}
    </div>
  );
}

function IconBtn({ children, onClick, title, active }: {
  children: React.ReactNode; onClick: () => void; title?: string; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 flex items-center justify-center rounded-md transition-colors duration-100"
      style={{ color: active ? "var(--accent)" : "var(--text-muted)", background: active ? "var(--accent-bg)" : "transparent" }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = active ? "var(--accent-bg)" : "transparent"; }}
    >
      {children}
    </button>
  );
}

function ToolbarBtn({ children, onClick, icon }: {
  children: React.ReactNode; onClick: () => void; icon?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors duration-100"
      style={{ color: "var(--text-muted)", border: "1px solid var(--border)", background: "transparent" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
    >
      {icon && <span>{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

function BookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="13" height="18" rx="2" fill="var(--accent)" opacity="0.9" />
      <rect x="8" y="3" width="13" height="18" rx="2" fill="var(--accent)" opacity="0.5" />
      <path d="M6 8h7M6 11h7M6 14h4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SidebarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}
