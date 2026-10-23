# 06. Delivery Plan and Decision Log

## Phases
0. **Discovery and planning:** audit workspace, tools, data sources, hosting, risks, architecture, ERD, costs, acceptance criteria. No implementation before approval.
1. **Foundation:** isolated repo, code quality, CI, environment validation, health endpoint.
2. **Catalog:** product categories, brands, models, variants, aliases, admin controls.
3. **Knowledge:** sources, articles, revisions, review workflow, applicability, media.
4. **Support:** customer portal, sessions, escalation, feedback.
5. **Historical import:** inspect exports, deduplicate, minimize sensitive data, preserve provenance, stage for review.
6. **RAG/evaluation:** retrieval, model adapter, citations, safe fallback, benchmark.
7. **Analytics:** local Dash/Plotly first, optional Plotly Cloud after data controls.
8. **Production readiness:** security, performance, backup/restore, monitoring, staging, rollback, approval.

## Approval gates
Stop and ask before creating/changing a repo if its target path is not approved; installing significant dependencies; selecting paid services or external AI; finalizing production schema; importing real customer data; changing production infrastructure/DNS/tunnel; destructive migrations; pushing to remote; deploying; or enabling public AI answers.

## Risks
Historical chats/images may be missing; old answers may be wrong; model/firmware applicability may be unclear; external AI may have privacy/cost implications; Plotly Cloud may not be appropriate for raw customer data; server changes may disrupt other services; imports may duplicate or misclassify records; scope may expand too quickly.

## Decision status
**Confirmed:** BBCare name; BBTech.shop; Router and Laptop initial sections; Next.js main app; Plotly Cloud optional; local development first; historical imports after foundation and audit.
**Proposed:** RAG before fine-tuning; PostgreSQL + pgvector; Drizzle ORM.
**Unknown:** auth provider, AI provider/model, storage provider, production hostname/port, current server configuration, numerical quality targets.

## Decision record
For each significant decision, record ID/date, context, options, recommendation, trade-offs, cost/privacy implications, approval status, and follow-up.
