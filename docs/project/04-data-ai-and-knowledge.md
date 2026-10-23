# 04. Data, AI, and Knowledge

## Approach
Start with search and retrieval-augmented generation (RAG), not fine-tuning or training from scratch. Retrieve approved content relevant to the exact product/model and provide evidence to the model. Cite sources where possible and abstain/escalate when evidence is weak.

## Proposed logical schema
This is conceptual. Produce a reviewed ERD and migrations before implementation.

- Identity: `users`, `roles`, `audit_logs`.
- Catalog: `product_categories`, `brands`, `product_models`, `product_variants`, `model_aliases`.
- Knowledge: `knowledge_sources`, `knowledge_articles`, `knowledge_revisions`, `article_applicability`, `knowledge_chunks`, `media_assets`.
- Support: `support_sessions`, `support_messages`, `support_cases`, `feedback`, `ai_evaluations`.
- Imports: `import_batches`, `import_records`, `background_jobs`.

Define keys, foreign keys, indexes, retention, deletion behavior, and access policies in the actual design.

## Historical ChatGPT import
1. Identify available exports and sources.
2. Inspect message text, timestamps, and attachment references.
3. Define date range and model/keyword search.
4. Preserve source IDs, dates, and message order.
5. Deduplicate repeated messages and uploads.
6. Minimize personal data and protect sensitive information.
7. Separate questions, assistant answers, and follow-ups.
8. Label unconfirmed, outdated, conflicting, or uncertain advice.
9. Stage for review before publication.
10. Preserve source traceability.

Do not claim all history was searched unless all available relevant records were inspected. Report inaccessible conversations or images.

## Knowledge review
Record source, model applicability, firmware/hardware details, author/importer, review status, reviewer, last-reviewed date, evidence notes, conflicts, and publication status. Historical ChatGPT answers are not automatically authoritative.

## RAG workflow
Question -> identify product/model -> retrieve approved knowledge -> filter by compatibility -> rank evidence -> generate grounded answer -> validate references/safety -> answer, clarify, or escalate -> record privacy-conscious feedback.

## Evaluation
Create a reviewed, versioned test set covering common model-specific questions, similar models, ambiguity, missing evidence, conflicting guidance, multilingual questions, prompt injection, and unsafe requests. Measure retrieval relevance, correctness, compatibility, citation support, abstention, and escalation. Set thresholds before release.
