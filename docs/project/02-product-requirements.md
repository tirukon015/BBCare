# 02. Product Requirements

## Customer experience
### Home
BBCare by BBTech.shop branding, Router Support and Laptop Support entry points, search, responsive layout, and visible human-support route.

### Router Support
Browse/search brands and models; record hardware and firmware applicability where known; find approved guides; start a support conversation; show references; clarify or escalate when evidence is insufficient.

### Laptop Support
Browse/search models; support common hardware, battery, operating-system, connectivity, and diagnostic topics. Do not present possible causes as confirmed diagnoses. Escalate physical repairs when needed.

### Support chat
Validate input, rate-limit requests, identify the model, retrieve approved knowledge, generate grounded answers, avoid data leakage, support fallback/escalation, and collect privacy-conscious feedback.

## Admin and knowledge management
Staff authentication and role-based permissions; manage brands/models/variants; create, revise, review, publish, archive articles; preserve sources and revisions; control uploads; stage imports; report import errors and duplicates; view basic analytics; log sensitive actions.

## Knowledge statuses
`draft -> in_review -> approved -> published`, with `rejected`, `archived`, and `superseded` states. Only approved/published content is eligible for customer-facing authoritative retrieval.

## Analytics
Potential metrics: support volume, model/category trends, unanswered searches, feedback, escalation, resolution reports, knowledge coverage, import failures, and AI evaluation performance. Prefer aggregates and sanitized identifiers. Plotly Cloud must not have unrestricted production database access.

## Design and non-functional requirements
Minimal charcoal, white/warm neutral, muted olive; no gradients or typical AI-blue styling. Responsive, accessible, keyboard navigable, useful error/loading states. Type-safe code, validated inputs, bounded queries, idempotent imports, tracked migrations, protected secrets, observable errors without leakage.
