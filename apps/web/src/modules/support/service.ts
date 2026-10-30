import "server-only";
import { generateGroundedAnswer, type Evidence, type ProductCandidate } from "@bbcare/ai";
import {
  detectCategory, detectLanguage, detectSupportMode, encryptSecret, matchScenarios, newToken, redactSecrets, routerModelByEcr, sanitizeIntake, scenarioByKey,
  scrubPersonalData, sha256, type SupportMode,
} from "@bbcare/core";
import { classifyResolution, resolveModels, searchKnowledge, type ModelCandidate, type SearchHit } from "@bbcare/db";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { aiProvider, aiState } from "@/lib/ai";
import { logger } from "@/lib/logger";
import { getRecommendations, type RecommendationCard } from "@/modules/commerce/service";
import { recordUnresolved } from "./gaps";
import { detectAndRecordDemand } from "./demand";
import { storeAttribution } from "./attribution";

export const SUPPORT_COOKIE = "bbcare_support";
const SESSION_DAYS = 7;

export interface SessionRow {
  id: string; public_id: string; token_hash: Buffer; locale: "en" | "ms"; category_id: string | null; model_id: string | null;
  variant_id: string | null; firmware: string | null; status: string; mode: string;
}

export async function createSession(opts: { locale: "en" | "ms"; categorySlug?: string | null; modelSlug?: string | null }) {
  const sql = db();
  const { token, hash } = newToken();
  const publicId = newToken(9).token;
  const [model] = opts.modelSlug
    ? await sql<{ id: string; category_id: string }[]>`SELECT id, category_id FROM catalog.product_models WHERE slug = ${opts.modelSlug} AND status <> 'hidden'`
    : [];
  const [cat] = !model && opts.categorySlug ? await sql<{ id: string }[]>`SELECT id FROM catalog.categories WHERE slug = ${opts.categorySlug}` : [];
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO support.sessions (public_id, token_hash, locale, category_id, model_id, expires_at)
    VALUES (${publicId}, ${hash}, ${opts.locale}, ${model?.category_id ?? cat?.id ?? null}, ${model?.id ?? null}, now() + ${`${SESSION_DAYS} days`}::interval) RETURNING id`;
  return { id: row!.id, publicId, token, maxAgeSeconds: SESSION_DAYS * 86400 };
}

/** Load a session only if the caller holds its token (cookie value "publicId.token"). */
export async function authorizeSession(publicId: string, cookieValue: string | undefined): Promise<SessionRow | null> {
  if (!cookieValue || !/^[A-Za-z0-9_-]{6,40}$/.test(publicId)) return null;
  const [cookiePublic, token] = cookieValue.split(".");
  if (cookiePublic !== publicId || !token) return null;
  const [row] = await db()<SessionRow[]>`
    SELECT id, public_id, token_hash, locale, category_id, model_id, variant_id, firmware, status, mode
    FROM support.sessions WHERE public_id = ${publicId} AND token_hash = ${sha256(token)} AND expires_at > now()`;
  return row ?? null;
}

export interface ArticleRef { slug: string; title: string; snippet: string; locale: "en" | "ms"; safetyLevel: string; models: string[] }
export interface AssistantPayload {
  kind: "answer" | "articles" | "clarify" | "no_answer";
  language: "en" | "ms";
  mode: "ai" | "search";
  mock?: boolean;
  aiUnavailable?: boolean;
  resolvedModel?: { slug: string; name: string } | null;
  candidates?: { slug: string; name: string; modelNumber: string }[];
  sections?: { confirmed: string[]; possibleCauses: string[]; steps: string[]; warnings: string[] };
  citations?: { slug: string; title: string }[];
  articles?: ArticleRef[];
  products?: RecommendationCard[];
  /** Link into the structured router journey when the message matches a Mesh or AP problem. */
  routerSuggestion?: { modelSlug: string; mode: SupportMode; scenario: string; titleEn: string; titleMs: string } | null;
}

export const MIN_COVERAGE = 0.5;

const PRODUCT_INTENT = /\b(buy|beli|charger|pengecas|adapter|accessor(y|ies)|aksesori|upgrade|replace(ment)?|ganti|mesh|node|cooling|penyejuk|recommend|cadang|cable|kabel)\b/i;

function toArticleRefs(hits: SearchHit[]): ArticleRef[] {
  return hits.slice(0, 3).map((h) => ({ slug: h.articleSlug, title: h.title, snippet: h.snippet.replace(/<<|>>/g, ""), locale: h.locale, safetyLevel: h.safetyLevel, models: h.appliesToModels }));
}

export async function handleCustomerMessage(session: SessionRow, rawText: string, opts: { modelSlug?: string | null }) {
  const sql = db();
  const text = redactSecrets(scrubPersonalData(rawText.trim())).text.slice(0, 1000);
  const language = detectLanguage(text, session.locale);

  // Explicit model choice (from clarify buttons or the model selector) wins.
  let modelId = session.model_id;
  let categoryId = session.category_id;
  let candidates: ModelCandidate[] = [];
  if (opts.modelSlug) {
    const [m] = await sql<{ id: string; category_id: string }[]>`SELECT id, category_id FROM catalog.product_models WHERE slug = ${opts.modelSlug} AND status <> 'hidden'`;
    if (m) { modelId = m.id; categoryId = m.category_id; }
  } else {
    candidates = await resolveModels(sql, text);
    const state = classifyResolution(candidates);
    if (state === "resolved" && candidates[0]!.id !== modelId) {
      modelId = candidates[0]!.id;
      categoryId = candidates[0]!.categoryId;
    } else if (state === "none") {
      // The customer switched product type (for example from a router to a laptop): drop the old model.
      const mentioned = detectCategory(text);
      if (mentioned) {
        const [cat] = await sql<{ id: string }[]>`SELECT id FROM catalog.categories WHERE slug = ${mentioned}`;
        if (cat && cat.id !== categoryId) { categoryId = cat.id; modelId = null; }
      }
    }
  }
  if (modelId !== session.model_id || categoryId !== session.category_id) {
    await sql`UPDATE support.sessions SET model_id = ${modelId}, category_id = ${categoryId} WHERE id = ${session.id}`;
  }
  const [customerMsg] = await sql<{ id: string }[]>`
    INSERT INTO support.messages (session_id, role, content, language) VALUES (${session.id}, 'customer', ${text}, ${language}) RETURNING id`;
  await sql`UPDATE support.sessions SET last_activity_at = now() WHERE id = ${session.id}`;

  const [model] = modelId
    ? await sql<{ slug: string; display_name: string; ecr_code: string | null }[]>`SELECT slug, display_name, ecr_code FROM catalog.product_models WHERE id = ${modelId}`
    : [];
  const resolvedModel = model ? { slug: model.slug, name: model.display_name } : null;
  const routerSuggestion = model?.ecr_code ? suggestRouterScenario(model.slug, text) : null;
  if (routerSuggestion && modelId) {
    await detectAndRecordDemand({
      modelId, supportMode: routerSuggestion.mode, scenarioKey: routerSuggestion.scenario, locale: language, question: text, origin: "assistant",
      sessionId: session.id, customerRef: session.public_id, alsoCheck: ["text_guide"],
    });
  }

  // Ambiguous model and no model known yet: ask before giving model-specific instructions.
  if (!modelId && !opts.modelSlug && classifyResolution(candidates) === "ambiguous") {
    const payload: AssistantPayload = {
      kind: "clarify", language, mode: "search", resolvedModel: null,
      candidates: candidates.slice(0, 4).map((c) => ({ slug: c.slug, name: c.displayName, modelNumber: c.modelNumber })),
    };
    return storeAssistant(session.id, payload, "clarify", language, null, customerMsg!.id);
  }

  const started = Date.now();
  const allHits = await searchKnowledge(sql, { query: text, locale: language, categoryId, modelId, strictApplicability: true, limit: 6 });
  // Only passages covering most of the question count as evidence; weaker matches are offered as related guides.
  const hits = allHits.filter((h) => h.coverage >= MIN_COVERAGE);
  const related = allHits.filter((h) => h.coverage < MIN_COVERAGE);
  const [run] = await sql<{ id: string }[]>`
    INSERT INTO support.retrieval_runs (session_id, query_normalized, filters, candidates, latency_ms)
    VALUES (${session.id}, ${text.slice(0, 300)}, ${sql.json({ modelId, categoryId, language })},
            ${sql.json(allHits.map((h) => ({ chunk: h.chunkId, rank: Number(h.rank.toFixed(4)), level: h.matchLevel, coverage: Number(h.coverage.toFixed(2)) })))}, ${Date.now() - started})
    RETURNING id`;

  const wantsProducts = PRODUCT_INTENT.test(text);
  const ai = await aiState(language);
  let payload: AssistantPayload | null = null;
  let outcome: "answered" | "abstain" | "clarify" = hits.length ? "answered" : "abstain";
  let citations: { chunkId: string; revisionId: string }[] = [];

  if (ai.enabled && hits.length > 0) {
    const provider = aiProvider()!;
    const chunkRows = await sql<{ id: string; revision_id: string; heading: string; content: string }[]>`
      SELECT id, revision_id, heading, content FROM knowledge.chunks WHERE id = ANY (${hits.slice(0, 4).map((h) => h.chunkId)}::uuid[])`;
    const evidence: Evidence[] = hits.slice(0, 4).flatMap((h, i) => {
      const c = chunkRows.find((r) => r.id === h.chunkId);
      return c ? [{ ref: `E${i + 1}`, chunkId: c.id, revisionId: c.revision_id, title: h.title, heading: c.heading, text: c.content, safetyLevel: h.safetyLevel }] : [];
    });
    const productCands: ProductCandidate[] = [];
    if (modelId && wantsProducts) {
      const rows = await sql<{ id: string; name_en: string }[]>`
        SELECT DISTINCT p.id, p.name_en FROM commerce.products p
        JOIN commerce.product_compatibility pc ON pc.product_id = p.id AND pc.verified_at IS NOT NULL
        WHERE pc.model_id = ${modelId} AND p.status = 'active' LIMIT 5`;
      rows.forEach((r, i) => productCands.push({ ref: `P${i + 1}`, productId: r.id, name: r.name_en }));
    }
    const history = (await sql<{ role: string; content: string }[]>`
      SELECT role, content FROM support.messages WHERE session_id = ${session.id} AND role IN ('customer','assistant') AND id <> ${customerMsg!.id}
      ORDER BY created_at DESC LIMIT 4`).reverse().map((m) => ({ role: m.role === "customer" ? ("user" as const) : ("assistant" as const), content: m.content.slice(0, 500) }));
    const result = await generateGroundedAnswer(provider, { question: text, locale: language, modelName: resolvedModel?.name ?? null, evidence, products: productCands, history });
    await sql`UPDATE support.retrieval_runs SET provider = ${provider.name}, model = ${"model" in result ? (result.model ?? null) : null}, prompt_version = ${result.promptVersion} WHERE id = ${run!.id}`;
    if (result.kind === "answer") {
      const slugs = await sql<{ revision_id: string; slug: string; title: string }[]>`
        SELECT r.id AS revision_id, a.slug, r.title FROM knowledge.revisions r JOIN knowledge.articles a ON a.id = r.article_id
        WHERE r.id = ANY (${result.answer.citations.map((c) => c.revisionId)}::uuid[])`;
      const products = result.answer.productIds.length && modelId
        ? await getRecommendations({ modelId, locale: language, context: "chat", supportSessionId: session.id, productIds: result.answer.productIds, limit: 2 })
        : [];
      citations = result.answer.citations.map((c) => ({ chunkId: c.chunkId, revisionId: c.revisionId }));
      payload = {
        kind: "answer", language, mode: "ai", mock: result.mock, resolvedModel,
        sections: { confirmed: result.answer.confirmed, possibleCauses: result.answer.possibleCauses, steps: result.answer.steps, warnings: result.answer.warnings },
        citations: [...new Map(slugs.map((s) => [s.slug, { slug: s.slug, title: s.title }])).values()],
        articles: toArticleRefs(hits), products,
      };
      if (result.removed.length) logger.warn({ removed: result.removed.length, session: session.public_id }, "ai output sentences removed by validator");
    } else {
      if (result.kind === "abstain") await recordUnresolved({ query: text, locale: language, source: "abstain", categoryId, modelId });
      payload = { kind: "articles", language, mode: "ai", aiUnavailable: result.kind === "unavailable", resolvedModel, articles: toArticleRefs(hits) };
      outcome = result.kind === "abstain" ? "abstain" : "answered";
    }
  }

  if (!payload) {
    if (hits.length === 0) await recordUnresolved({ query: text, locale: language, source: "no_results", categoryId, modelId });
    const products = modelId && wantsProducts ? await getRecommendations({ modelId, locale: language, context: "chat", supportSessionId: session.id, limit: 2 }) : [];
    payload = hits.length
      ? { kind: "articles", language, mode: "search", resolvedModel, articles: toArticleRefs(hits), products }
      : { kind: "no_answer", language, mode: ai.enabled ? "ai" : "search", resolvedModel, products, articles: toArticleRefs(related) };
  }
  if (routerSuggestion) payload.routerSuggestion = routerSuggestion;
  return storeAssistant(session.id, payload, outcome, language, run!.id, customerMsg!.id, citations);
}

function suggestRouterScenario(modelSlug: string, text: string): AssistantPayload["routerSuggestion"] {
  const modes: SupportMode[] = [detectSupportMode(text) ?? "mesh", "mesh", "ap"];
  for (const mode of [...new Set(modes)]) {
    const top = matchScenarios(text, mode)[0];
    const s = top ? scenarioByKey(top.key) : null;
    if (s) return { modelSlug, mode, scenario: s.key, titleEn: s.en, titleMs: s.ms };
  }
  return null;
}

async function storeAssistant(
  sessionId: string, payload: AssistantPayload, outcome: "answered" | "abstain" | "clarify" | "escalate", language: "en" | "ms",
  runId: string | null, _customerMessageId: string, citations: { chunkId: string; revisionId: string }[] = [],
) {
  const sql = db();
  const summary = payload.kind === "answer" ? [...(payload.sections?.confirmed ?? []), ...(payload.sections?.steps ?? [])].join(" ").slice(0, 2000) : payload.kind;
  const [msg] = await sql<{ id: string; created_at: Date }[]>`
    INSERT INTO support.messages (session_id, role, content, payload, outcome, language, retrieval_run_id)
    VALUES (${sessionId}, 'assistant', ${summary}, ${sql.json(payload as never)}, ${outcome}, ${language}, ${runId}) RETURNING id, created_at`;
  for (const [i, c] of citations.entries()) {
    await sql`INSERT INTO support.answer_citations (message_id, chunk_id, revision_id, position) VALUES (${msg!.id}, ${c.chunkId}, ${c.revisionId}, ${i})`;
  }
  if (payload.mode === "ai") await sql`UPDATE support.sessions SET mode = 'ai' WHERE id = ${sessionId}`;
  return { id: msg!.id, outcome, payload };
}

export async function recordMessageFeedback(session: SessionRow, messageId: string, rating: 1 | -1, reason: string | null) {
  const sql = db();
  const [m] = await sql<{ id: string }[]>`SELECT id FROM support.messages WHERE id = ${messageId} AND session_id = ${session.id} AND role = 'assistant'`;
  if (!m) return false;
  await sql`INSERT INTO support.feedback (session_id, message_id, rating, reason_code) VALUES (${session.id}, ${messageId}, ${rating}, ${reason})`;
  if (rating === -1) {
    const [q] = await sql<{ content: string }[]>`
      SELECT content FROM support.messages WHERE session_id = ${session.id} AND role = 'customer' AND created_at <= (SELECT created_at FROM support.messages WHERE id = ${messageId})
      ORDER BY created_at DESC LIMIT 1`;
    if (q) await recordUnresolved({ query: q.content, locale: session.locale, source: "negative_feedback", categoryId: session.category_id, modelId: session.model_id });
  }
  return true;
}

export async function markResolved(session: SessionRow) {
  await db()`UPDATE support.sessions SET status = 'resolved' WHERE id = ${session.id} AND status = 'open'`;
}

export interface RouterContext {
  model: string; mode: SupportMode; scenario: string; answers: Record<string, unknown>; flowId?: string | null; outcome?: "not_verified" | "steps_failed";
}

export interface EscalationInput {
  name: string; channel: "email" | "whatsapp" | "phone"; contact: string; subject: string; description?: string; locale: "en" | "ms";
  router?: RouterContext | null;
}

/**
 * Create a support case. Router context is validated against the authoritative catalogue and
 * scenario list; intake answers keep only known choices. Free text has personal data and
 * anything that looks like a password or one-time code removed. Returns a one-time follow-up
 * code that the customer needs, with the reference, to check progress.
 */
export async function escalate(session: SessionRow | null, input: EscalationInput, opts: { attribution?: unknown; req?: Request } = {}) {
  const key = env().BBCARE_ENCRYPTION_KEY;
  const sql = db();
  const isEmail = input.channel === "email";
  let modelId = session?.model_id ?? null;
  let categoryId = session?.category_id ?? null;
  let mode: SupportMode | null = null;
  let scenario: string | null = null;
  let intake: Record<string, string> = {};
  let flowId: string | null = null;
  const routerDef = input.router ? routerModelByEcr(input.router.model) : null;
  const scenarioDef = input.router ? scenarioByKey(input.router.scenario) : null;
  if (input.router && routerDef && scenarioDef && scenarioDef.modes.includes(input.router.mode)) {
    const [m] = await sql<{ id: string; category_id: string }[]>`SELECT id, category_id FROM catalog.product_models WHERE ecr_code = ${routerDef.ecr}`;
    if (m) {
      modelId = m.id; categoryId = m.category_id; mode = input.router.mode; scenario = scenarioDef.key;
      intake = sanitizeIntake(scenarioDef.key, input.router.answers);
      if (input.router.flowId && /^[0-9a-f-]{36}$/i.test(input.router.flowId)) {
        const [f] = await sql<{ id: string }[]>`SELECT id FROM knowledge.flows WHERE id = ${input.router.flowId} AND model_id = ${m.id}`;
        flowId = f?.id ?? null;
      }
    }
  }
  const subject = redactSecrets(scrubPersonalData(input.subject)).text.slice(0, 200);
  const cleanDesc = input.description ? redactSecrets(input.description) : null;
  const followUp = newToken(9);
  const [c] = await sql<{ id: string; reference: string }[]>`
    INSERT INTO support.cases (session_id, category_id, model_id, subject, description, locale, contact_name_enc, contact_email_enc, contact_phone_enc,
      preferred_channel, support_mode, scenario_key, intake, flow_id, followup_hash)
    VALUES (${session?.id ?? null}, ${categoryId}, ${modelId}, ${subject},
            ${cleanDesc?.text.slice(0, 4000) ?? null}, ${input.locale}, ${encryptSecret(input.name.slice(0, 120), key)},
            ${isEmail ? encryptSecret(input.contact, key) : null}, ${isEmail ? null : encryptSecret(input.contact, key)}, ${input.channel},
            ${mode}, ${scenario}, ${sql.json(intake)}, ${flowId}, ${followUp.hash})
    RETURNING id, reference`;
  await sql`INSERT INTO support.case_events (case_id, kind, data) VALUES (${c!.id}, 'created', ${sql.json({ via: session ? "chat" : mode ? "router" : "form", outcome: input.router?.outcome ?? null })})`;
  if (session) await sql`UPDATE support.sessions SET status = 'escalated' WHERE id = ${session.id}`;
  // Attribution: a chat session already carries its own; a case created from a page form gets its own row.
  if (!session && opts.req) await storeAttribution(opts.req, { caseId: c!.id }, opts.attribution);
  if (session || mode) {
    await recordUnresolved({ query: scenario ? `${scenario} ${subject}` : subject, locale: input.locale, source: "escalation", categoryId, modelId });
  }
  // Missing-resource detection: an escalation for a known model, mode and problem is demand for a
  // text guide (and for whatever the customer's own words ask for).
  if (modelId && mode && scenario) {
    await detectAndRecordDemand({
      modelId, supportMode: mode, scenarioKey: scenario, locale: input.locale,
      question: [input.subject, input.description ?? ""].filter(Boolean).join(" "), origin: "escalation",
      sessionId: session?.id ?? null, caseId: c!.id, customerRef: session?.public_id ?? c!.id, alsoCheck: ["text_guide"],
    });
  }
  return { ...c!, followUpCode: followUp.token, redacted: !!cleanDesc?.redacted };
}

export interface CaseStatusView {
  reference: string; status: string; updatedAt: string; customerNote: string | null; modelName: string | null;
  messages: { at: string; from: "customer" | "team"; text: string }[];
}

/** Customer view of a case: requires the reference and the follow-up code. Shows no staff-internal notes. */
export async function getCaseForCustomer(reference: string, code: string): Promise<CaseStatusView | null> {
  if (!/^BBC-\d{4}-\d{6}$/.test(reference) || !/^[A-Za-z0-9_-]{8,40}$/.test(code)) return null;
  const sql = db();
  const [c] = await sql<{ id: string; reference: string; status: string; updated_at: Date; customer_note: string | null; model_name: string | null }[]>`
    SELECT c.id, c.reference, c.status, c.updated_at, c.customer_note, m.display_name AS model_name
    FROM support.cases c LEFT JOIN catalog.product_models m ON m.id = c.model_id
    WHERE c.reference = ${reference} AND c.followup_hash = ${sha256(code)}`;
  if (!c) return null;
  const events = await sql<{ at: Date; kind: string; data: { text?: string } }[]>`
    SELECT at, kind, data FROM support.case_events WHERE case_id = ${c.id} AND kind IN ('customer_message', 'customer_note') ORDER BY at`;
  return {
    reference: c.reference, status: c.status, updatedAt: c.updated_at.toISOString(), customerNote: c.customer_note, modelName: c.model_name,
    messages: events.filter((e) => typeof e.data.text === "string").map((e) => ({ at: e.at.toISOString(), from: e.kind === "customer_message" ? "customer" : "team", text: e.data.text! })),
  };
}

export async function addCustomerCaseMessage(reference: string, code: string, text: string): Promise<{ ok: boolean; redacted: boolean }> {
  if (!/^BBC-\d{4}-\d{6}$/.test(reference) || !/^[A-Za-z0-9_-]{8,40}$/.test(code)) return { ok: false, redacted: false };
  const sql = db();
  const [c] = await sql<{ id: string; status: string }[]>`SELECT id, status FROM support.cases WHERE reference = ${reference} AND followup_hash = ${sha256(code)}`;
  if (!c || c.status === "closed") return { ok: false, redacted: false };
  const clean = redactSecrets(scrubPersonalData(text.trim()));
  await sql.begin(async (tx) => {
    await tx`INSERT INTO support.case_events (case_id, kind, data) VALUES (${c.id}, 'customer_message', ${tx.json({ text: clean.text.slice(0, 2000) })})`;
    await tx`UPDATE support.cases SET status = CASE WHEN status IN ('waiting_customer', 'resolved') THEN 'open' ELSE status END WHERE id = ${c.id}`;
  });
  return { ok: true, redacted: clean.redacted };
}
