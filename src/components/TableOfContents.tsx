import type { TocEntry } from "../lib/textSegmenter";

interface Props {
  toc: TocEntry[];
  currentSegment: number;
  onJump: (segmentIndex: number) => void;
}

export function TableOfContents({ toc, currentSegment, onJump }: Props) {
  if (toc.length === 0) {
    return (
      <div className="p-4 text-sm italic" style={{ color: "var(--text-faint)" }}>
        No headings
      </div>
    );
  }

  return (
    <nav className="p-2 overflow-y-auto flex-1">
      <div
        className="text-[10px] uppercase tracking-widest font-semibold px-2.5 py-2"
        style={{ color: "var(--text-faint)" }}
      >
        Contents
      </div>
      <ul className="space-y-px">
        {toc.map((entry) => {
          const isActive = currentSegment === entry.segmentIndex;
          const indent = (entry.level - 1) * 10;
          return (
            <li key={entry.id}>
              <button
                onClick={() => onJump(entry.segmentIndex)}
                className="w-full text-left py-1.5 pr-3 text-xs transition-all duration-100"
                style={{
                  paddingLeft: `${10 + indent}px`,
                  color: isActive ? "var(--accent)" : "var(--text-muted)",
                  background: isActive ? "var(--accent-bg)" : "transparent",
                  fontWeight: entry.level === 1 ? 600 : isActive ? 500 : 400,
                  borderRadius: "8px",
                  display: "block",
                }}
                onMouseEnter={(e) => {
                  if (!isActive)
                    (e.currentTarget as HTMLElement).style.background = "var(--border-soft)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive)
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                {entry.text}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
