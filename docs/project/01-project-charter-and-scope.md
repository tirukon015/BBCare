# 01. Project Charter and Scope

## Vision
BBCare is BBTech.shop's customer care and support platform. It helps customers find product information, troubleshoot common problems, follow approved guides, and reach human support when AI cannot answer reliably.

## Initial scope
- Router Support and Laptop Support.
- Product brand/model catalog, including variants where needed.
- Searchable, versioned knowledge base.
- Customer support experience and staff/admin interface.
- AI answers grounded in approved knowledge, with source references where possible.
- Feedback and human escalation.
- Basic operational analytics.
- Historical conversation/document import after data-source audit.
- Local development, automated tests, controlled production deployment.

## Later or optional
- Plotly Cloud analytics.
- Voice support and AI-assisted tutorial creation.
- Additional product categories.
- Shopee or other integrations, subject to access and policy review.
- Fine-tuning only if evaluation later demonstrates a need.

## Out of scope for first release
- Dedicated mobile-product support section.
- Training a model from scratch.
- Autonomous changes to customer routers or firmware.
- Automatic publication of unreviewed AI-generated technical instructions.
- Changes to RPOMS, Print Engine, or unrelated production systems.

## Users
Customers, support staff, knowledge editors/reviewers, and administrators.

## Principles
Accuracy before automation; model/firmware compatibility; transparent uncertainty; source traceability; privacy by design; least privilege; modular monolith before microservices; avoid unnecessary cost and infrastructure.

## Success criteria
Customers can find relevant support; staff can maintain approved knowledge; retrieval is traceable; AI is evaluated before release; unsupported cases are escalated; critical checks pass; deployment has backup and rollback procedures. Set numeric targets after baseline measurement.
