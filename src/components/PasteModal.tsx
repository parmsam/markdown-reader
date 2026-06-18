import { useState, useRef, useEffect } from "react";

interface Props {
  onSubmit: (markdown: string, title: string) => void;
  onClose: () => void;
}

const PLACEHOLDER = `# Document Title

Start writing or paste your markdown here.

You can use **bold**, *italic*, and all standard markdown.

## Section One

Each paragraph or sentence becomes a TTS segment.

- List items are read individually
- Perfect for notes or articles

> Blockquotes are spoken with a pause.
`;

export function PasteModal({ onSubmit, onClose }: Props) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("My Document");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      if (text.trim()) onSubmit(text, title);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-2xl flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "var(--bg-raised)",
          border: "1px solid var(--border)",
          boxShadow: "0 16px 64px -8px rgba(0,0,0,0.28)",
          maxHeight: "90vh",
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border-soft)" }}
        >
          <h2 className="font-semibold" style={{ color: "var(--text)" }}>
            Paste Markdown
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-lg leading-none transition-colors"
            style={{ color: "var(--text-faint)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
              (e.currentTarget as HTMLElement).style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--text-faint)";
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3 p-5 flex-1 min-h-0">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm transition-all outline-none"
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
              onFocus={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--accent-ring)")}
              onBlur={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--border)")}
              placeholder="Document title"
            />
          </div>

          <div className="flex flex-col gap-1 flex-1 min-h-0">
            <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Content
            </label>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="flex-1 min-h-64 rounded-lg px-3 py-2.5 text-sm font-mono resize-none outline-none transition-all"
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
              onFocus={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--accent-ring)")}
              onBlur={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--border)")}
              placeholder={PLACEHOLDER}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderTop: "1px solid var(--border-soft)" }}
        >
          <span className="text-xs" style={{ color: "var(--text-faint)" }}>
            ⌘↵ to open
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-sm transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => text.trim() && onSubmit(text, title)}
              disabled={!text.trim()}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--accent)" }}
              onMouseEnter={(e) => {
                if (text.trim()) (e.currentTarget as HTMLElement).style.filter = "brightness(1.1)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.filter = "";
              }}
            >
              Open Document
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
