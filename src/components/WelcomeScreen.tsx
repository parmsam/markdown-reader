import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  onMarkdown: (md: string, title?: string) => void;
  onPaste: () => void;
}

export function WelcomeScreen({ onMarkdown, onPaste }: Props) {
  const handleOpenFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        { name: "Documents", extensions: ["md", "markdown", "pdf", "txt"] },
      ],
    });

    if (!selected || typeof selected !== "string") return;
    const path = selected;
    const filename = path.split("/").pop() ?? "Document";

    if (path.toLowerCase().endsWith(".pdf")) {
      try {
        const md = await invoke<string>("convert_pdf", { path });
        onMarkdown(md, filename.replace(/\.pdf$/i, ""));
      } catch (e) {
        alert(`PDF conversion failed: ${e}`);
      }
    } else {
      const content = await invoke<string>("read_file", { path }).catch((e) => {
        alert(`Failed to read file: ${e}`);
        return null;
      });
      if (content) onMarkdown(content, filename.replace(/\.(md|markdown|txt)$/i, ""));
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-10 px-8">
      {/* Logo */}
      <div className="text-center">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-5"
          style={{ background: "var(--accent-bg)", border: "1px solid var(--border)" }}
        >
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="13" height="18" rx="2" fill="var(--accent)" opacity="0.9" />
            <rect x="8" y="3" width="13" height="18" rx="2" fill="var(--accent)" opacity="0.45" />
            <path d="M6 8h7M6 11h7M6 14h4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-1.5" style={{ color: "var(--text)" }}>
          Markdown Reader
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Read aloud with Kokoro AI — highlights as it speaks
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <ActionCard
          onClick={handleOpenFile}
          icon="📂"
          title="Open File"
          desc="Markdown, PDF, or plain text"
        />
        <ActionCard
          onClick={onPaste}
          icon="📋"
          title="Paste Markdown"
          desc="Type or paste text directly"
        />
      </div>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        Or drag & drop a file anywhere
      </p>
    </div>
  );
}

function ActionCard({
  onClick,
  icon,
  title,
  desc,
}: {
  onClick: () => void;
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all duration-150 group"
      style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-ring)";
        (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)";
      }}
    >
      <span className="text-3xl">{icon}</span>
      <div>
        <div className="font-semibold text-sm" style={{ color: "var(--text)" }}>
          {title}
        </div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          {desc}
        </div>
      </div>
    </button>
  );
}
