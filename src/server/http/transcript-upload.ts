import "server-only";
import type { NextRequest } from "next/server";
import { MAX_UPLOAD_BYTES } from "@/domain/meetings";
import { ingestTranscript, type IngestedTranscript } from "@/server/ingestion";
import { ValidationError } from "./errors";

export interface MeetingRequestBody {
  fields: Record<string, unknown>;
  transcript: IngestedTranscript | null;
}

/**
 * Accepts either JSON (`{ ...fields, transcriptText }`) or multipart form data with a
 * JSON `data` part and an optional `file` part, and ingests the transcript.
 */
export async function readMeetingRequest(req: NextRequest): Promise<MeetingRequestBody> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES + 64 * 1024) throw new ValidationError("File is too large");
    const form = await req.formData().catch(() => {
      throw new ValidationError("Invalid form data");
    });
    let fields: Record<string, unknown> = {};
    const data = form.get("data");
    if (typeof data === "string" && data) {
      try {
        fields = JSON.parse(data);
      } catch {
        throw new ValidationError("Invalid form data");
      }
    }
    const file = form.get("file");
    let transcript: IngestedTranscript | null = null;
    if (file && typeof file !== "string" && file.size > 0) {
      transcript = await ingestTranscript({
        kind: "file",
        fileName: file.name,
        mimeType: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
    } else if (typeof fields.transcriptText === "string" && fields.transcriptText.trim()) {
      transcript = await ingestTranscript({ kind: "text", text: fields.transcriptText });
    }
    delete fields.transcriptText;
    return { fields, transcript };
  }

  let fields: Record<string, unknown>;
  try {
    fields = (await req.json()) as Record<string, unknown>;
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
  const text = typeof fields.transcriptText === "string" ? fields.transcriptText : "";
  delete fields.transcriptText;
  return { fields, transcript: text.trim() ? await ingestTranscript({ kind: "text", text }) : null };
}
