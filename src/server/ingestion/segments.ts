import type { TranscriptSegment } from "@/domain/meetings";

const TS = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?`;

/** Ordered from most to least specific; each yields speaker/timestamp/text groups. */
const LINE_PATTERNS: { re: RegExp; map: (m: RegExpMatchArray) => { speaker: string | null; timestamp: string | null; text: string } }[] = [
  // [00:01:23] Jane Doe: text   |   (00:01) Jane Doe: text
  {
    re: new RegExp(String.raw`^[\[(](${TS})[\])]\s*([^:\n]{1,60}?):\s*(.*)$`),
    map: (m) => ({ timestamp: m[1], speaker: m[2], text: m[3] }),
  },
  // Jane Doe [00:01:23]: text   |   Jane Doe (00:01): text
  {
    re: new RegExp(String.raw`^([^:\n\[(]{1,60}?)\s*[\[(](${TS})[\])]\s*:?\s*(.*)$`),
    map: (m) => ({ speaker: m[1], timestamp: m[2], text: m[3] }),
  },
  // 00:01:23 Jane Doe: text
  {
    re: new RegExp(String.raw`^(${TS})\s+([^:\n]{1,60}?):\s*(.*)$`),
    map: (m) => ({ timestamp: m[1], speaker: m[2], text: m[3] }),
  },
  // Jane Doe: text  (speaker label must look like a name, not a sentence)
  {
    re: /^([A-ZÀ-ɏ][\wÀ-ɏ.'\- ]{0,40}?):\s+(.+)$/,
    map: (m) => ({ speaker: m[1], timestamp: null, text: m[2] }),
  },
];

const TIMESTAMP_ONLY = new RegExp(String.raw`^(?:\d+\s*)?(${TS})(?:\s*-->\s*${TS})?\s*$`);
const SPEAKER_ONLY = /^([A-ZÀ-ɏ][\wÀ-ɏ.'\- ]{0,40})\s*$/;

/** A line holding only a name: 1-4 capitalised words, no sentence punctuation. */
function isSpeakerLine(line: string): boolean {
  if (!SPEAKER_ONLY.test(line) || /[.?!]$/.test(line)) return false;
  const words = line.split(/\s+/);
  return words.length <= 4 && words.every((w) => /^[A-ZÀ-Þ]/.test(w));
}

/**
 * Best-effort split of a transcript into speaker turns, keeping character offsets
 * into the original text so evidence can be highlighted. Handles common export
 * formats (Zoom/Teams/Meet text, "Name: text", "[hh:mm:ss] Name: text", VTT/SRT-like
 * blocks). Unlabelled text becomes segments without a speaker.
 */
export function parseSegments(raw: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let currentSpeaker: string | null = null;
  let pendingTimestamp: string | null = null;
  let newTurn = true;
  let offset = 0;

  for (const line of raw.split("\n")) {
    const lineStart = offset;
    offset += line.length + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed === "WEBVTT") {
      newTurn = true;
      continue;
    }

    const tsOnly = trimmed.match(TIMESTAMP_ONLY);
    if (tsOnly) {
      pendingTimestamp = tsOnly[1];
      newTurn = true;
      continue;
    }

    let labelled: { speaker: string | null; timestamp: string | null; text: string } | null = null;
    for (const pattern of LINE_PATTERNS) {
      const m = trimmed.match(pattern.re);
      if (m) {
        labelled = pattern.map(m);
        break;
      }
    }

    // A short capitalised line on its own introduces the next turn (Teams/Zoom exports).
    if (!labelled && isSpeakerLine(trimmed)) {
      currentSpeaker = trimmed;
      newTurn = true;
      continue;
    }

    if (labelled) {
      if (labelled.speaker) currentSpeaker = labelled.speaker.trim();
      if (labelled.timestamp) pendingTimestamp = labelled.timestamp;
      newTurn = true;
    }
    const text = (labelled ? labelled.text : trimmed).trim();
    if (!text) continue;

    const prev = segments.at(-1);
    if (prev && !newTurn && prev.speaker === currentSpeaker) {
      prev.text += `\n${text}`;
    } else {
      segments.push({ speaker: currentSpeaker, timestamp: pendingTimestamp, text, start: lineStart + line.indexOf(text) });
    }
    pendingTimestamp = null;
    newTurn = false;
  }
  return segments;
}

/** Distinct speakers in order of first appearance. */
export function speakersOf(segments: TranscriptSegment[]): string[] {
  return [...new Set(segments.map((s) => s.speaker).filter((s): s is string => !!s))];
}
