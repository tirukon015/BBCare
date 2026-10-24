# ADR 0008: Router-first catalogue and verified-only model guidance

**Status:** Accepted, October 2026

## Context
BBCare's first release supports exactly seven router models, and only two categories: Mesh Connection Mode and Access Point (AP) Mode. Research for these models (`docs/research/mesh-ap/`) could only be gathered from search excerpts, because the manufacturer and ISP documentation sites are blocked in the development environment (blocker B-15). Owner instruction: never publish unverified solutions as facts, and never invent menu names, button combinations, indicator meanings, compatibility or reset procedures.

## Options
1. Publish the research steps with an "unverified" label.
2. Publish nothing model-specific and send every customer to staff.
3. Model the journey fully, but show step-by-step guidance only where a named reviewer verified it against a full source; everywhere else ask safe structured questions and escalate.

## Decision
Option 3.
- The customer router catalogue is the set of models with an ECR code (`catalog.product_models.ecr_code`). The seven names and codes live in `packages/core/src/router-support.ts` and are seeded idempotently. Staff cannot rename a model that has an ECR code.
- Scenarios (the 11 decision trees) and their intake questions are code: structure only, no model-specific instructions. Intake answers are fixed choices; free text never enters a case through intake.
- Model-specific guidance is a `knowledge.flows` row with model, mode and scenario. The database refuses to publish it unless it is verified by a named staff member (`flows_publish_verified`), linked to an approved, reviewed source, and free of Malay translation placeholders (`flows_publish_guard`). Editing a verified flow withdraws the verification.
- The source must be held in BBCare (uploaded document or stored text, for example a BBTech hands-on test record) before a flow can be marked verified or published (migration 0003, `knowledge.flow_has_held_source`). A web link alone is refused, so a verification flag can never stand for a manual that nobody could open. A live flow cannot lose its last held source.
- Customer pages and AI retrieval use one query, `loadVerifiedRouterFlow` (`packages/db/src/repos/router.ts`), which applies all of the above and reads only knowledge tables.
- Research records are imported only as drafts that carry their research verification level.
- Configuration-destructive steps require warnings in both languages (`flow_steps_destructive_warned`), and the customer must tick an acknowledgement before continuing.
- Product photos are public only after a reviewer other than the uploader verifies them. Until then a "photo pending verification" placeholder is shown.
- Fictional sample content exists only for automated tests (`seed({ samples: true })`) in an inactive category, never in the router catalogue.

## Consequences
- Today no customer sees model-specific steps: every scenario shows "No verified guide yet" and routes to staff with structured context. Coverage grows as reviewers verify drafts in Admin, Router coverage.
- Cost: none. Privacy: cases hold structured answers plus a scrubbed, secret-redacted description. Operations: reviewers need the full manuals (B-15) and BBTech answers (B-16).

## Follow-up
- Allowlist documentation domains, verify drafts, translate Malay steps, upload and verify photos.
- Connect router evidence to the AI assistant only after the owner approves AI activation (see `docs/integration/flask-ai-service.md`).
