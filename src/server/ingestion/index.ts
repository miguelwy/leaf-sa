import "server-only";
import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  MAX_TRANSCRIPT_CHARS,
  MAX_UPLOAD_BYTES,
  type TranscriptFormat,
  type TranscriptSegment,
} from "@/domain/meetings";
import { ValidationError } from "@/server/http/errors";
import { parseSegments } from "./segments";

export interface IngestedTranscript {
  raw: string;
  format: TranscriptFormat;
  fileName: string | null;
  segments: TranscriptSegment[];
}

export type IngestionInput =
  | { kind: "text"; text: string }
  | { kind: "file"; fileName: string; mimeType: string; bytes: Uint8Array };

/**
 * A transcript source turns some input into plain text. New sources (e.g. audio
 * transcription) plug in here without changing the meeting data model.
 */
interface IngestionSource {
  format: TranscriptFormat;
  extensions: readonly string[];
  mimeTypes: readonly string[];
  extract(bytes: Uint8Array): Promise<string>;
}

const decodeUtf8 = async (bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: false }).decode(bytes);

const SOURCES: IngestionSource[] = [
  { format: "txt", extensions: [".txt", ".vtt", ".srt"], mimeTypes: ["text/plain", "text/vtt"], extract: decodeUtf8 },
  { format: "md", extensions: [".md", ".markdown"], mimeTypes: ["text/markdown", "text/x-markdown", "text/plain"], extract: decodeUtf8 },
  {
    format: "docx",
    extensions: [".docx"],
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    extract: async (bytes) => {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      return value;
    },
  },
  {
    format: "pdf",
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
    extract: async (bytes) => {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      return Array.isArray(text) ? text.join("\n") : text;
    },
  },
];

function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : "";
}

/** Normalises line endings and invisible characters; keeps the content otherwise verbatim. */
export function normalizeTranscript(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[​﻿]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export async function ingestTranscript(input: IngestionInput): Promise<IngestedTranscript> {
  let raw: string;
  let format: TranscriptFormat;
  let fileName: string | null = null;

  if (input.kind === "text") {
    raw = input.text;
    format = "paste";
  } else {
    if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new ValidationError(`File is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB)`);
    }
    const ext = extensionOf(input.fileName);
    const source = SOURCES.find((s) => s.extensions.includes(ext));
    if (!source) {
      throw new ValidationError(`Unsupported file type. Accepted: ${ACCEPTED_UPLOAD_EXTENSIONS.join(", ")}`);
    }
    // The extension decides the parser; an explicit, contradicting MIME type is rejected.
    const mime = input.mimeType.split(";")[0].trim().toLowerCase();
    if (mime && mime !== "application/octet-stream" && !source.mimeTypes.includes(mime)) {
      throw new ValidationError(`File content type "${mime}" does not match its extension`);
    }
    try {
      raw = await source.extract(input.bytes);
    } catch {
      throw new ValidationError(`Could not read the ${source.format.toUpperCase()} file. Is it a valid, text-based document?`);
    }
    format = source.format;
    fileName = input.fileName.slice(0, 200);
  }

  raw = normalizeTranscript(raw);
  if (!raw) {
    throw new ValidationError(
      format === "pdf" ? "No text found in the PDF. Scanned (image-only) PDFs are not supported." : "The transcript is empty",
    );
  }
  if (raw.length > MAX_TRANSCRIPT_CHARS) {
    throw new ValidationError(`Transcript is too long (${raw.length.toLocaleString()} characters, max ${MAX_TRANSCRIPT_CHARS.toLocaleString()})`);
  }
  return { raw, format, fileName, segments: parseSegments(raw) };
}
