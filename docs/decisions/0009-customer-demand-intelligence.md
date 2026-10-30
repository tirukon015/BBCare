# ADR 0009: Customer demand intelligence and resource library

**Status:** Accepted, October 2026

## Context
BBTech needs to know what customers ask for that BBCare cannot yet give them: which router models and problems generate demand, which videos, diagrams, images and documents are missing, who asked (traceable to the support case), and where customers came from. The owner's rules: never fabricate a resource, respect consent and Malaysian privacy law, no covert fingerprinting, never use customer messages for AI training automatically.

## Decision
- **Detection at the points where BBCare learns the customer's model, mode and problem:** a support request (escalation) with router context, a support-assistant question that resolves to a router model and matches a scenario, and a typed description followed by the customer choosing a problem. Each checks the approved library and verified flows, records a demand only for what is missing, and never promises anything.
- **Grouping:** one `support.resource_demands` row per model, hardware revision, mode, problem, resource type and language. Every original request is kept in `support.resource_demand_requests` with its scrubbed, secret-redacted question, interpretation (rule-based until the AI is activated), origin, channel, session or case link and timestamp. Unique customers are counted by an internal reference: the support session, or the case when there is no session. BBCare has no customer accounts and does not resolve identity across sessions; typed descriptions without a session or case count once under a one-off anonymous reference.
- **Resource type** is inferred from the customer's words by rules (video, diagram, image, document; otherwise a step-by-step text guide). Escalations also check for a text guide.
- **Attribution** (`support.attribution`) stores the latest and first touch as the browser reported them: referrer host only, landing path, UTM fields and an explicit `ch` link label. Channel classification uses only those signals, in that order; a missing referrer is "unknown", never "direct". First touch lives in the tab's sessionStorage; it persists 30 days in localStorage only after analytics consent. No fingerprinting, no raw IP, no cross-site identifiers.
- **Resource library** (`knowledge.resources`): staff upload videos (MP4, WebM), diagrams and images (PNG, JPEG, WebP) and documents (PDF), typed by content. A resource reaches customers, the media route and AI retrieval only when approved by someone other than the uploader (database constraint). Approval fulfils matching demands and keeps their history; publishing a verified flow fulfils text-guide demands. Rejection returns demands to missing. Usage and feedback: `resource_open` and `resource_feedback` analytics events, `support.feedback.resource_id`.
- **Access:** aggregate dashboard needs `analytics.read`; original questions and case links need `support.transcripts.read` and each view is audited; uploads need `sources.upload`; approval needs `knowledge.publish`. Customer contact details are never shown on demand pages; they remain behind the audited case reveal.
- **Retention:** question text is replaced after the support retention period (180 days); counts remain for trends.

## Consequences
- Staff see demand from real requests only; no synthetic numbers.
- Channel data will often read "unknown" until BBTech labels its links (`?ch=shopee`, `?ch=qr`) or uses UTM parameters; that is the honest state.
- Resource approval duplicates nothing: it reuses `knowledge.media_assets`, the existing storage, RBAC and audit log.

## Follow-up
- When the AI is activated, record `interpreted_by = 'ai'` for AI-interpreted requirements and keep the rule-based fallback.
- Add export of demand aggregates (CSV) if BBTech asks; no personal data in exports.
