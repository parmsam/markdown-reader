import { useEffect, useRef, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TextSegment } from "../lib/textSegmenter";

interface Props {
  markdown: string;
  segments: TextSegment[];
  currentSegment: number;
  currentWord: number;
  onClickSegment: (index: number) => void;
}

export function MarkdownViewer({
  markdown,
  segments,
  currentSegment,
  currentWord,
  onClickSegment,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLElement | null>(null);
  // Track whether the user is manually scrolling so we don't hijack their scroll
  const userScrollingRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for user scroll and pause auto-scroll for 2.5s
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      userScrollingRef.current = true;
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        userScrollingRef.current = false;
      }, 2500);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  // Auto-scroll only if the active element is out of the viewport AND user isn't scrolling
  useEffect(() => {
    if (!activeRef.current || userScrollingRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const el = activeRef.current;
    const elRect = el.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();

    const isVisible =
      elRect.top >= cRect.top + 60 && elRect.bottom <= cRect.bottom - 120;

    if (!isVisible) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentSegment]);

  const segmentWords = useMemo(
    () => segments.map((seg) => (seg.type === "code" ? [] : seg.text.split(/\s+/).filter(Boolean))),
    [segments]
  );

  const blocks = markdown.split(/\n{2,}/);
  let segIdx = 0;

  return (
    <div ref={containerRef} className="flex-1 h-full overflow-y-auto px-8 py-10 pb-40">
      <div className="max-w-[680px] mx-auto">
        <div className="prose-reader">
          {blocks.map((block, blockIdx) => {
            const trimmed = block.trim();
            if (!trimmed) return null;

            const blockSegs: Array<{ idx: number; seg: TextSegment }> = [];
            while (segIdx < segments.length && segments[segIdx].blockIndex === blockIdx) {
              blockSegs.push({ idx: segIdx, seg: segments[segIdx] });
              segIdx++;
            }

            return (
              <MarkdownBlock
                key={blockIdx}
                block={trimmed}
                blockSegs={blockSegs}
                segmentWords={segmentWords}
                currentSegment={currentSegment}
                currentWord={currentWord}
                onClickSegment={onClickSegment}
                activeRef={activeRef}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface BlockProps {
  block: string;
  blockSegs: Array<{ idx: number; seg: TextSegment }>;
  segmentWords: string[][];
  currentSegment: number;
  currentWord: number;
  onClickSegment: (index: number) => void;
  activeRef: React.MutableRefObject<HTMLElement | null>;
}

function MarkdownBlock({
  block,
  blockSegs,
  segmentWords,
  currentSegment,
  currentWord,
  onClickSegment,
  activeRef,
}: BlockProps) {
  const isHeading = /^#{1,6}\s/.test(block);
  const isCode = /^```/.test(block);
  const isBlockquote = /^>/.test(block);
  const isList = /^[-*+]\s|^\d+\.\s/.test(block);

  const setActiveRef = useCallback(
    (el: HTMLElement | null) => {
      if (el) activeRef.current = el;
    },
    [activeRef]
  );

  if (isCode) {
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{block}</ReactMarkdown>;
  }

  if (isHeading || isBlockquote || isList) {
    const segInfo = blockSegs[0];
    const isActive = segInfo?.idx === currentSegment;

    return (
      <div
        ref={isActive ? setActiveRef : undefined}
        onClick={() => segInfo && onClickSegment(segInfo.idx)}
        className={`rounded-md -mx-2 px-2 cursor-pointer transition-all duration-100 ${
          isActive ? "sentence-active" : "hover:opacity-80"
        }`}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{block}</ReactMarkdown>
      </div>
    );
  }

  // Paragraph — may span multiple sentence segments
  if (blockSegs.length <= 1) {
    const segInfo = blockSegs[0];
    const isActive = segInfo?.idx === currentSegment;

    return (
      <p
        ref={isActive ? setActiveRef : undefined}
        onClick={() => segInfo && onClickSegment(segInfo.idx)}
        className={`rounded-md -mx-2 px-2 cursor-pointer transition-all duration-100 ${
          isActive ? "sentence-active" : "hover:opacity-80"
        }`}
      >
        {isActive && segmentWords[segInfo.idx]?.length > 0
          ? renderWordHighlights(block, currentWord)
          : <InlineMarkdown>{block}</InlineMarkdown>
        }
      </p>
    );
  }

  return (
    <p>
      {blockSegs.map(({ idx, seg }, i) => {
        const isActive = idx === currentSegment;
        return (
          <span
            key={idx}
            ref={isActive ? setActiveRef : undefined}
            onClick={() => onClickSegment(idx)}
            className={`rounded-sm cursor-pointer transition-all duration-100 ${
              isActive ? "sentence-active" : "hover:opacity-80"
            }`}
          >
            {isActive
              ? renderWordHighlights(seg.rawText, currentWord)
              : seg.rawText}
            {i < blockSegs.length - 1 ? " " : ""}
          </span>
        );
      })}
    </p>
  );
}

function InlineMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{ p: ({ children }) => <>{children}</> }}
    >
      {children}
    </ReactMarkdown>
  );
}

function renderWordHighlights(text: string, currentWord: number): React.ReactNode {
  const parts = text.split(/(\s+)/);
  let wordIdx = 0;
  return (
    <>
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return part;
        const idx = wordIdx++;
        return (
          <span key={i} className={idx === currentWord ? "word-active" : ""}>
            {part}
          </span>
        );
      })}
    </>
  );
}
