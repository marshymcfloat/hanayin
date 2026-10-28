import { MAX_ASSISTANT_MESSAGE_LENGTH } from "@/features/social/conversation-assistant/schemas";
import type { AssistantLanguage } from "@/features/social/conversation-assistant/types";

const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phone = /(?:\+?63[\s.-]*9|09)(?:[\s.-]*\d){9}\b/g;
const longNumber = /\b(?:\d[ -]?){12,19}\b/g;

export function redactAssistantMessage(message: string): string {
  const redacted = message.normalize("NFKC").replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "")
    .replace(email, "[REDACTED_EMAIL]").replace(phone, "[REDACTED_PHONE]")
    .replace(longNumber, "[REDACTED_NUMBER]");
  return Array.from(redacted).map(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("").trim();
}

/** Defense in depth, not a comprehensive moderation or PII detection guarantee. */
export function inspectAssistantMessage(message: string): { safe: boolean; reason: string; redacted: string } {
  if (!message.trim() || message.length > MAX_ASSISTANT_MESSAGE_LENGTH) return { safe: false, reason: "INVALID_MESSAGE", redacted: "" };
  const redacted = redactAssistantMessage(message);
  if (/^(?:stop|unsubscribe|opt[ -]?out)[.!\s]*$/i.test(redacted)
    || /\b(?:stop messaging|unsubscribe|opt out|ayoko|ayaw ko|huwag na|wag na|tigilan)\b/i.test(redacted)) {
    return { safe: false, reason: "OPT_OUT", redacted };
  }
  if (/\[REDACTED_(?:EMAIL|PHONE|NUMBER)\]/.test(redacted)
    || /\b(?:my name is|my address|i live at|ako si|pangalan ko|address ko|nakatira|tirahan ko|password|passcode|otp|credit card|bank account|booking\s*#|customer record|staff salary|employee salary|api key|access token|sahod|sweldo|rekord ng|listahan ng customer)\b/i.test(redacted)) {
    return { safe: false, reason: "PRIVATE_INFORMATION", redacted };
  }
  const rules: Array<[RegExp, string]> = [
    [/\b(?:ignore|override|forget|disregard|bypass)\b.{0,60}\b(?:instruction|previous|policy|policies|rule|system|safeguard)/i, "UNTRUSTED_INSTRUCTIONS"],
    [/\b(?:system prompt|developer message|jailbreak|SELECT\s+.+\s+FROM|DROP\s+TABLE|reveal secrets|other tenant|other business data)\b/i, "UNTRUSTED_INSTRUCTIONS"],
    [/\b(?:balewalain|kalimutan|lampasan|palitan|huwag sundin|wag sundin)\b.{0,80}\b(?:tagubilin|utos|patakaran|rules?|instructions?|system)\b|\b(?:ilabas|ipakita|ibigay)\b.{0,60}\b(?:sikreto|secret|ibang negosyo|private record)\b/i, "UNTRUSTED_INSTRUCTIONS"],
    [/\b(?:human|real person|talk to|speak to|contact the owner|manager please|tao|kausap|makausap|kakausapin|may ari)\b/i, "HUMAN_REQUEST"],
    [/\b(?:complaint|refund|payment|deposit|chargeback|gcash|cancel|reschedule|rebook|reklamo|bayad|binayaran|kansel\w*|ibalik (?:ang|yung|un|ung) pera|ilipat (?:ang|yung) appointment)\b/i, "REQUIRES_HUMAN"],
    [/\b(?:medical|diagnos\w*|allerg\w*|pregnan\w*|infection|bleeding|burnt|burned|doctor|medication|prescri\w*|botox|disease|emergency|suicid\w*|hurt myself|urgent|asap|buntis|dumudugo|namamaga|impeksyon|nasunog|sugat|gamot|doktor|masakit|magpakamatay)\b/i, "SAFETY_ESCALATION"],
  ];
  for (const [pattern, reason] of rules) if (pattern.test(redacted)) return { safe: false, reason, redacted };
  return { safe: true, reason: "APPROVED_READ_ONLY_TOPIC", redacted };
}

export function assistantExplicitLanguagePreference(message: string): AssistantLanguage | null {
  const text = redactAssistantMessage(message);
  const requested = new Set<AssistantLanguage>();
  if (/\b(?:english please|in english|english (?:na lang|lang|pls)|(?:speak|reply|respond) (?:in )?english)\b/i.test(text)) requested.add("ENGLISH");
  if (/\b(?:tagalog|filipino)\s+(?:please|pls|po|na lang|lang)|\b(?:in|sa|mag|use|gamitin ang)\s*(?:tagalog|filipino)\b/i.test(text)) requested.add("FILIPINO");
  if (/\b(?:taglish please|in taglish|taglish (?:na lang|lang|pls)|(?:use|sa) taglish)\b/i.test(text)) requested.add("TAGLISH");
  return requested.size === 1 ? [...requested][0] : requested.size > 1 ? "UNKNOWN" : null;
}

/** Greetings, emoji and exact catalog names cannot establish language or intent. */
export function isAssistantSubstantiveMessage(message: string, catalogNames: string[]): boolean {
  const text = redactAssistantMessage(message).toLocaleLowerCase().replace(/[?!.,]/g, "").trim();
  if (!text || !/[\p{L}\p{N}]/u.test(text) || /^(?:hi|hello|hey|good (?:morning|afternoon|evening)|kumusta|kamusta|salamat|thanks|thank you)(?: po)?$/i.test(text)) return false;
  return !catalogNames.some(name => name.normalize("NFKC").toLocaleLowerCase().trim() === text);
}
