import {
  assistantAvailabilitySchema, assistantDecisionSchema, assistantPublicFactsSchema, assistantTimestampSchema,
} from "@/features/social/conversation-assistant/schemas";
import { ASSISTANT_AVAILABILITY_MAX_AGE_MS, ASSISTANT_FACTS_MAX_AGE_MS, ASSISTANT_MIN_CONFIDENCE } from "@/features/social/conversation-assistant/policy";
import type { AssistantAvailability, AssistantDecision, AssistantLanguage, AssistantPublicFacts } from "@/features/social/conversation-assistant/types";

export const MAX_ASSISTANT_REPLY_LENGTH = 1_200;
export const MAX_ASSISTANT_REPLY_SERVICES = 3;
export const MAX_ASSISTANT_REPLY_SLOTS = 3;
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const money = (price: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(price);

export function assistantPHDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function assistantBookingPath(businessSlug: string): string {
  return `/${encodeURIComponent(businessSlug)}/booking`;
}

function localized(language: AssistantLanguage, english: string, filipino: string, taglish = filipino) {
  return language === "FILIPINO" ? filipino : language === "TAGLISH" ? taglish : english;
}

function wrap(facts: AssistantPublicFacts, content: string, language: AssistantLanguage) {
  const prefix = localized(language, `I'm ${facts.name}'s automated assistant.\n`, `Ako ang automated assistant ng ${facts.name}.\n`);
  const suffix = localized(language,
    `\nThis does not create or reserve a booking. Book: ${assistantBookingPath(facts.businessSlug)}\nReply "human" to ask the team for help.`,
    `\nWala pang booking o reserbasyon. Mag-book: ${assistantBookingPath(facts.businessSlug)}\nSabihin ang "tao" para humingi ng tulong sa team.`,
    `\nWala pang booking o reservation. Book here: ${assistantBookingPath(facts.businessSlug)}\nReply "human" kung gusto mong kausapin ang team.`);
  const budget = MAX_ASSISTANT_REPLY_LENGTH - prefix.length - suffix.length;
  return prefix + (content.length <= budget ? content : content.slice(0, budget - 1) + "…") + suffix;
}

export function buildAssistantReply(input: {
  facts: AssistantPublicFacts; decision: AssistantDecision; now: string; availability?: AssistantAvailability; language?: AssistantLanguage;
}): { status: "PROPOSED" | "HANDOFF"; reason: string; reply: string | null } {
  const handoff = (reason: string) => ({ status: "HANDOFF" as const, reason, reply: null });
  const factsResult = assistantPublicFactsSchema.safeParse(input.facts);
  const decisionResult = assistantDecisionSchema.safeParse(input.decision);
  if (!factsResult.success || !decisionResult.success || !assistantTimestampSchema.safeParse(input.now).success) return handoff("INVALID_REPLY_CONTEXT");
  const facts = factsResult.data;
  const decision = decisionResult.data;
  const language = input.language ?? decision.language ?? "ENGLISH";
  const copy = (english: string, filipino: string, taglish?: string) => localized(language, english, filipino, taglish);
  const current = Date.parse(input.now);
  const factAge = current - Date.parse(facts.generatedAt);
  if (factAge < 0 || factAge > ASSISTANT_FACTS_MAX_AGE_MS) return handoff("FACTS_STALE");
  const selected = facts.services.find(service => service.id === decision.serviceId);
  const propose = (content: string, reason = "GROUNDED_TEMPLATE") => ({ status: "PROPOSED" as const, reason, reply: wrap(facts, content, language) });
  if (decision.intentConfidence < ASSISTANT_MIN_CONFIDENCE || decision.intent === "handoff") return handoff("HUMAN_REVIEW_REQUIRED");
  if (language === "UNKNOWN") return propose("Which language would you prefer: Filipino, English, or Taglish? / Anong wika ang gusto mo: Filipino, English, o Taglish?", "LANGUAGE_CLARIFICATION_REQUIRED");
  if (["services", "recommendation", "availability"].includes(decision.intent)) {
    if (decision.serviceId !== null && !selected) return handoff("UNKNOWN_SERVICE");
    if (decision.serviceConfidence < ASSISTANT_MIN_CONFIDENCE) return handoff("UNCERTAIN_SERVICE");
  }
  if (decision.intent === "booking_link") return propose(copy("You can choose services and view the latest available times on our booking page.", "Puwedeng pumili ng serbisyo at tingnan ang mga oras sa booking page.", "Puwedeng pumili ng service at tingnan ang latest available times sa booking page."));
  if (decision.intent === "clarify") return propose(copy("Which service and date would you like to know about?", "Anong serbisyo at petsa ang gusto mong malaman?", "Anong service at date ang gusto mong malaman?"), "CLARIFICATION_REQUIRED");
  if (decision.intent === "categories") {
    const categories = [...new Set(facts.services.map(service => service.category))].sort();
    return categories.length ? propose(`${copy("Our catalog includes:", "Narito ang mga kategorya:", "Ito ang categories sa catalog:")} ${categories.slice(0, 8).join(", ")}.${categories.length > 8 ? copy(" More categories are listed on the booking page.", " May iba pang kategorya sa booking page.") : ""}`) : handoff("CATALOG_UNAVAILABLE");
  }
  if (decision.intent === "services" || decision.intent === "recommendation") {
    const rows = selected ? [selected] : facts.services.slice(0, MAX_ASSISTANT_REPLY_SERVICES);
    if (!rows.length) return handoff("CATALOG_UNAVAILABLE");
    const label = decision.intent === "recommendation" ? copy("Catalog options to consider (not a medical or suitability assessment):", "Mga pagpipilian sa catalog; para sa medikal na payo o kung bagay sa iyo, kausapin ang team:", "Options sa catalog; kausapin ang team para sa medical advice o suitability:") : copy("Current catalog details:", "Narito ang nakalistang serbisyo:", "Ito ang current catalog details:");
    return propose(`${label}\n${rows.map(service => `${service.name} · ${service.category} · ${copy("base price", "panimulang presyo", "base price")} ${money(service.price)}${service.durationMinutes === null ? "" : ` · ${service.durationMinutes} min`}`).join("\n")}`);
  }
  if (decision.intent === "hours") {
    if ((decision.serviceId !== null && !selected) || decision.serviceConfidence < ASSISTANT_MIN_CONFIDENCE) {
      return propose(copy("Which service would you like opening hours for?", "Para sa anong serbisyo ang oras na hinahanap mo?", "Para sa anong service ang opening hours na hinahanap mo?"), "CLARIFICATION_REQUIRED");
    }
    const general = facts.hours.filter(hour => hour.category.toLowerCase() === "general");
    const confidentService = decision.serviceConfidence >= ASSISTANT_MIN_CONFIDENCE ? selected : undefined;
    const specific = confidentService ? facts.hours.filter(hour => hour.category.toLowerCase() === confidentService.category.toLowerCase()) : [];
    const categoryCount = new Set(facts.hours.map(hour => hour.category.toLowerCase())).size;
    const rows = specific.length ? specific : general.length ? general : categoryCount === 1 ? facts.hours : [];
    if (!rows.length) return facts.hours.length ? propose(copy("Hours vary by service category. Which service would you like?", "Magkakaiba ang oras bawat kategorya. Anong serbisyo ang gusto mo?", "Iba-iba ang hours bawat category. Anong service ang gusto mo?"), "CLARIFICATION_REQUIRED") : handoff("HOURS_UNAVAILABLE");
    const lines = [...rows].sort((a, b) => a.dayOfWeek - b.dayOfWeek).slice(0, 7)
      .map(hour => `${days[hour.dayOfWeek]}: ${hour.isClosed ? copy("closed", "sarado", "closed") : `${hour.openTime}–${hour.closeTime}`}`);
    return propose(`${copy(`Listed ${rows[0].category} hours (Philippine time):`, `Nakalistang oras para sa ${rows[0].category} (oras sa Pilipinas):`, `Listed hours para sa ${rows[0].category} (Philippine time):`)}\n${lines.join("\n")}`);
  }
  if (decision.intent === "availability") {
    if (!selected || !decision.date) return propose(copy("Please specify one service and a date (YYYY-MM-DD) so availability can be checked.", "Anong serbisyo at petsa (YYYY-MM-DD) ang gusto mo? Kailangan ito para matingnan ang mga oras.", "Anong service at date (YYYY-MM-DD) ang gusto mo para ma-check ang availability?"), "CLARIFICATION_REQUIRED");
    if (decision.dateConfidence < ASSISTANT_MIN_CONFIDENCE) return handoff("UNCERTAIN_DATE");
    const parsed = assistantAvailabilitySchema.safeParse(input.availability);
    if (!parsed.success) return handoff("AVAILABILITY_NOT_CHECKED");
    const availability = parsed.data;
    const age = current - Date.parse(availability.checkedAt);
    if (availability.businessId !== facts.businessId || availability.serviceId !== selected.id || availability.date !== decision.date) return handoff("AVAILABILITY_CONTEXT_MISMATCH");
    if (age < 0 || age > ASSISTANT_AVAILABILITY_MAX_AGE_MS) return handoff("AVAILABILITY_STALE");
    if (availability.slots.some(slot => assistantPHDate(slot.startTime) !== decision.date)) return handoff("AVAILABILITY_CONTEXT_MISMATCH");
    const slots = availability.slots.filter(slot => Date.parse(slot.startTime) > current).slice(0, MAX_ASSISTANT_REPLY_SLOTS);
    if (!slots.length) return propose(copy(`No current available times were returned for ${selected.name} on ${decision.date}. The team can help with alternatives. Availability can change.`, `Walang oras na naibalik para sa ${selected.name} sa ${decision.date}. Puwedeng tumulong ang team sa ibang pagpipilian. Maaaring magbago ang mga oras.`, `Walang available times na naibalik para sa ${selected.name} sa ${decision.date}. Puwedeng tumulong ang team sa alternatives. Availability can change.`));
    const times = slots.map(slot => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(slot.startTime)));
    return propose(copy(`Provisional available times for ${selected.name} on ${decision.date}: ${times.join(", ")} (Philippine time). Availability can change before you book.`, `Mga oras na nakita para sa ${selected.name} sa ${decision.date}: ${times.join(", ")} (oras sa Pilipinas). Pansamantala ito at maaaring magbago bago ka mag-book.`, `Provisional available times para sa ${selected.name} sa ${decision.date}: ${times.join(", ")} (Philippine time). Puwedeng magbago bago ka mag-book.`));
  }
  return handoff("UNSUPPORTED_TOPIC");
}
