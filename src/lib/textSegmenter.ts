export interface TextSegment {
  id: string;
  text: string;       // plain text for TTS
  rawText: string;    // original markdown text (for position tracking)
  type: "heading" | "paragraph" | "listitem" | "blockquote" | "code";
  blockIndex: number; // which markdown block this belongs to
  sentenceIndex: number; // within the block
}

// Strip markdown formatting for TTS
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/!\[.*?\]\(.+?\)/g, "")
    .replace(/#{1,6}\s+/g, "")
    .replace(/>\s+/g, "")
    .replace(/[-*+]\s+/g, "")
    .replace(/\d+\.\s+/g, "")
    .trim();
}

// Split text into sentences
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space and capital letter
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z"']|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return sentences.length > 0 ? sentences : [text];
}

export function segmentMarkdown(markdown: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let blockIndex = 0;
  let globalSentenceIndex = 0;

  // Split into blocks (paragraphs, headings, etc.)
  const blocks = markdown.split(/\n{2,}/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Detect block type
    if (/^#{1,6}\s/.test(trimmed)) {
      // Heading - treat as single segment
      const plain = stripMarkdown(trimmed);
      if (plain) {
        segments.push({
          id: `seg-${globalSentenceIndex}`,
          text: plain,
          rawText: trimmed,
          type: "heading",
          blockIndex,
          sentenceIndex: globalSentenceIndex++,
        });
      }
    } else if (/^```/.test(trimmed)) {
      // Code block - skip TTS or say "code block"
      segments.push({
        id: `seg-${globalSentenceIndex}`,
        text: "code block",
        rawText: trimmed,
        type: "code",
        blockIndex,
        sentenceIndex: globalSentenceIndex++,
      });
    } else if (/^>/.test(trimmed)) {
      // Blockquote
      const plain = stripMarkdown(trimmed);
      const sentences = splitSentences(plain);
      for (const sentence of sentences) {
        if (sentence.trim()) {
          segments.push({
            id: `seg-${globalSentenceIndex}`,
            text: sentence.trim(),
            rawText: sentence,
            type: "blockquote",
            blockIndex,
            sentenceIndex: globalSentenceIndex++,
          });
        }
      }
    } else if (/^[-*+]\s|^\d+\.\s/.test(trimmed)) {
      // List items
      const lines = trimmed.split("\n");
      for (const line of lines) {
        const plain = stripMarkdown(line);
        if (plain) {
          segments.push({
            id: `seg-${globalSentenceIndex}`,
            text: plain,
            rawText: line,
            type: "listitem",
            blockIndex,
            sentenceIndex: globalSentenceIndex++,
          });
        }
      }
    } else {
      // Regular paragraph - split into sentences
      const plain = stripMarkdown(trimmed);
      const sentences = splitSentences(plain);
      for (const sentence of sentences) {
        if (sentence.trim()) {
          segments.push({
            id: `seg-${globalSentenceIndex}`,
            text: sentence.trim(),
            rawText: sentence,
            type: "paragraph",
            blockIndex,
            sentenceIndex: globalSentenceIndex++,
          });
        }
      }
    }

    blockIndex++;
  }

  return segments;
}

export interface TocEntry {
  level: number;
  text: string;
  id: string;
  segmentIndex: number;
}

export function extractToc(markdown: string): TocEntry[] {
  const toc: TocEntry[] = [];
  const lines = markdown.split("\n");
  let segIndex = 0;

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/\*\*/g, "").replace(/\*/g, "").trim();
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      toc.push({ level, text, id, segmentIndex: segIndex });
      segIndex++;
    }
  }

  return toc;
}
