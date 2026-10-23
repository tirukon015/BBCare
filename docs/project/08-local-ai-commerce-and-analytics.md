# 08. Local AI, Commerce Links, and Customer Intelligence

**Status:** Confirmed requirements (owner instruction, October 2026). Design details are in `docs/architecture/blueprint.md`.

## Business scope
- BBCare is the customer support, technical knowledge, product discovery, and customer intelligence platform for BBTech.shop in **Malaysia**.
- Storefront: https://www.bbtech.shop/ . Shopee shop: https://shopee.com.my/bbtech.shop
- Initial categories: Router Support, Laptop Support.
- Launch languages: **English and Malay**. Additional languages must be addable without code restructuring.

## Local AI
- No paid AI API budget. Inference and embeddings run on the owner's existing server, which already hosts a Flask-based AI service.
- Do not replace, reinstall, or rebuild the existing server or Flask service. Integrate through a private, authenticated API only.
- Audit hardware and software (read-only) before recommending or installing models.
- Prefer pretrained models plus RAG. Fine-tuning only after a verified knowledge base and evaluation baseline justify it. No training from scratch.
- AI answers are disabled by default until the owner approves the model, privacy boundaries, evaluation results, security controls, and resource limits.
- The website must remain fully useful when the AI service is unavailable (search-first mode).
- The assistant must state that it is an AI assistant and never claim to be human.

## Conversational behaviour
- Understand English, Malay, colloquial Malay, spelling errors, and model terminology.
- Resolve the exact product model before model-specific instructions; ask clarifying questions when ambiguous.
- Use only approved, published evidence; show sources.
- Separate confirmed facts from possible causes; include safety warnings.
- Abstain and offer escalation when evidence is insufficient.
- Never invent firmware versions, compatibility, availability, prices, or links.

## Products and Shopee
- Controlled catalog: internal identifier, category, brand, model, aliases, specifications, compatibility, BBTech.shop URL, Shopee URL and listing identifier (when verified), status, verification history.
- Stock and price only from an authorized, current source, with a last-verified timestamp.
- Start with manually curated listing mappings. Shopee API synchronization is a separate, later, approved capability. No scraping of restricted endpoints.
- Track recommendation impressions and Shopee outbound clicks. A click is a referral, never a confirmed purchase.

## Analytics
- First-party, privacy-conscious analytics covering traffic, journeys, search demand, knowledge gaps, product interest, support outcomes, approximate Malaysian state-level geography, devices, performance, and engagement.
- No raw IP storage in general analytics. No fingerprinting. No identity resolution across sessions.
- No keystroke capture and no recording of private support content.
- Third-party heatmap or recording tools (for example Microsoft Clarity) require privacy review and owner approval before activation.

## Privacy and legal
- Malaysian Personal Data Protection Act 2010 and the Personal Data Protection (Amendment) Act 2024 (DPO appointment, breach notification, data portability) must be reviewed by a qualified person before launch.
- The platform must never be described as legally compliant without that review.
- Separate anonymous visitors, anonymous support sessions, staff, and any future verified customer accounts.

## Knowledge improvement
- Governed intake of manufacturer documentation, internal procedures, manuals, historical conversations, feedback, unresolved questions, bilingual examples, and evaluation datasets.
- Historical and customer-generated content is never automatically treated as verified truth.
- Unresolved questions feed a knowledge-gap queue.
