/**
 * Removes direct contact details before text is sent to an AI provider. Names are
 * kept because speaker attribution is needed for analysis.
 */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Phone-like sequences of 8+ digits with common separators; avoids timestamps like 00:01:23.
const PHONE = /(?<![\d:])(?:\+?\d[\d\s().-]{7,}\d)(?![\d:])/g;
const CARD_OR_ID = /\b(?:\d[ -]?){13,19}\b/g;

export function redactContactDetails(text: string): string {
  return text.replace(EMAIL, "[email]").replace(CARD_OR_ID, "[number]").replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 8 ? "[phone]" : m));
}
