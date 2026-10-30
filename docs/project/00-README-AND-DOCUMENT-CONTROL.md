# BBCare Project Documentation
**Organization:** BBTech.shop | **Version:** 1.0 | **Status:** Planning and discovery | **Date:** 23 October 2026

## Purpose
This set is the source of truth for BBCare, BBTech.shop's customer care and support platform. Initial product sections are Router Support and Laptop Support. Additional product categories may be added later.

## Index
- `01-project-charter-and-scope.md`: vision, scope, users, success criteria.
- `02-product-requirements.md`: customer and admin features.
- `03-architecture-and-repository.md`: system design and repository.
- `04-data-ai-and-knowledge.md`: schema concepts, imports, RAG, evaluation.
- `05-security-testing-and-deployment.md`: security, tests, environments, release.
- `06-delivery-plan-and-decision-log.md`: milestones, risks, decisions.
- `07-agent-working-agreement.md`: rules for the coding agent.
- `08-local-ai-commerce-and-analytics.md`: Malaysia scope, local AI, Shopee links, analytics (added v2).
- `09-cloud-first-execution-policy.md`: cloud development, GitHub persistence, autonomy boundaries (added v3).
- `10-master-roadmap-and-gap-analysis.md`: the owner's original handwritten plan mapped to the codebase, with statuses, phases, effort and required inputs (added 2026-10-30). Supersedes the phase list in 06 for sequencing.
- `BBCare-Planning-Prompt.txt`: prompt for discovery only.

## Confirmed decisions
- Name: **BBCare**.
- Customer-facing descriptor: **Customer Care & Support Platform by BBTech.shop**.
- Initial sections: Router Support and Laptop Support.
- Main application: Next.js and TypeScript.
- Analytics: Python Dash/Plotly, with Plotly Cloud optional.
- Workflow: local development and tests first, production server later with explicit approval.
- Import historical ChatGPT conversations only after the foundation and data audit.
- Start with curated knowledge and RAG. Fine-tuning is not a prerequisite.
- Agent must audit and propose a plan before implementation. Wait for explicit approval.

## Canonical source rule
The Markdown files in this repository are the only source of truth. The original Word handbook and chat-based discovery reports are superseded. Approved decisions are recorded as ADRs in `docs/decisions/`; the architecture is described in `docs/architecture/blueprint.md`.

## Status labels
**Confirmed** means agreed. **Proposed** means awaiting approval. **Unknown** means audit or clarification is needed.
