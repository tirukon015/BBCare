# 10. Master Roadmap and Gap Analysis

**Status:** Current (owner's handwritten plan reviewed against the codebase, 2026-10-30).
**Source:** the owner's original handwritten BBCare plan (three notebook pages) plus the fifteen requirements the owner listed from it. Nothing from that plan is dropped: every item appears below with a status, a phase and the inputs it needs.

## Priority order (owner instruction)
1. The seven router models, Mesh Connection Mode and AP Mode, verified guidance and staff workflow. **Current work. Not interrupted.**
2. Integration with the owner's existing local Flask AI service, on the verified router knowledge.
3. Everything else, in the phases below.

Nothing in this document authorises laptop implementation, importing real customer data, connecting Shopee accounts, installing models, deploying a public site, or paid services. Each of those keeps its approval gate.

## Status definitions
| Status | Meaning |
|---|---|
| Implemented and verified | In the codebase, covered by automated tests, CI green. |
| Partially implemented | Groundwork exists (schema, module, admin page or plan) but the requirement is not usable end to end. |
| Not implemented | No code yet. |
| Requires owner or business data or approval | Code may be ready, but it cannot proceed without an approval, a credential, a document or a business decision. |

## Gap analysis: the owner's fifteen requirements

| # | Requirement (owner's words) | Status | What exists today | What is missing | Phase |
|---|---|---|---|---|---|
| 1 | Router customer support and customer reply history | Implemented and verified (seven models, Mesh and AP). Partially implemented for "reply history" | Model, mode and problem journey in English and Malay; verified-only guidance with reset warnings; structured intake and escalation; case reference plus follow-up code; customer and staff messages on a case; support assistant sessions with transcript. 135 e2e tests, CI green (`6082c96`). | No verified guide is live yet (manuals blocked, B-15, B-18). History is per case and per assistant session; there is no customer account that groups a person's past requests (deliberate: no identity resolution without consent and legal review). | R1 (now) |
| 2 | Website click tracking and customer behaviour analytics, with privacy protections | Implemented and verified (extended 2026-10-30: unified Customer Analytics & Intelligence section, traffic sources and campaigns, click heatmap grid, journey and router analytics, media performance, tracking configuration audit; see `docs/analytics/implementation-matrix.md`) | First-party events (page views, searches, support outcomes, `ui_click`, scroll and time on page, Shopee outbound clicks, resource opens and feedback, web vitals), consent gate, personal-data scrubbing, raw IP discarded, state-level geo, nightly rollups, small-area suppression, admin dashboard and CSV export, 90-day raw retention. Support channel and traffic attribution per session or case (referrer host, landing page, UTM, first and latest touch, explicit link labels), with "unknown" when nothing reliable was reported (ADR 0009). | Third-party heatmaps or session recording stay off unless the owner approves after privacy review. | P5 |
| 3 | Exporting authorised historical customer reply data | Partially implemented | ChatGPT export parser, staging, scrubbing, review and promotion to an *unverified* source (`import-chatgpt`, Admin, Historical imports), tested with synthetic data. Approved AI examples export as JSONL. | The owner's real export files and written authorisation (B-13). Exports of BBCare's own case history for the owner (CSV, scrubbed) are not built yet. | P2 |
| 4 | Train and operate our own local AI model on approved BBTech knowledge | Partially implemented (preparation) | Provider interface, Flask adapter (private network only, bearer token, timeouts, circuit breaker), mock provider for tests, grounded-answer validator, retrieval evaluation gate, verified-only router evidence builder, staff-reviewed training-example pipeline with privacy screen and JSONL export. AI off by default. | Server audit (B-01), private network path (B-02), model approval (B-03), evaluation on real router questions, owner approval to activate. Fine-tuning only after enough approved examples and a baseline. | R2, P3 |
| 5 | Reuse the AI for laptop customer support | Not implemented (by design, not started) | The knowledge schema, retrieval and AI pipeline are category-agnostic; a laptop category existed in early samples and is now inactive. | Laptop catalogue, laptop knowledge, laptop scenarios. Owner approval to start. | P4 |
| 6 | Download and organise the actual laptop inventory and historical laptop data | Requires owner or business data or approval | Catalogue schema (brands, models, variants, aliases, firmware), product and listing schema, CSV-style admin pages. | The real laptop list, the historical laptop data files, and approval to import. | P4 |
| 7 | Shopee customer support and authorised Shopee data integration | Partially implemented | Verified Shopee listing links, outbound referral tracking (`/go/r/{id}`), allowlisted domains, price and stock hidden unless an authorised fresh source exists, escalation form. "Shopee link customer support if need human support" maps to the existing escalation plus the contact page. | Shopee Open Platform or Affiliate access (B-14), a Shopee-facing support entry link, order or chat data (only with authorisation; no scraping). | P5 |
| 8 | Historical ChatGPT customer-support replies as a knowledge and training source | Partially implemented | Same pipeline as #3. Imported conversations are marked unverified and must be reviewed against manufacturer documentation before reuse; they never auto-train. | The export files and authorisation (B-13); reviewer time. | P2 |
| 9 | Evaluate suitable Hugging Face models for local deployment | Requires owner or business data or approval | Shortlist and evaluation matrix in the discovery reports (Qwen3, SEA-LION, Sailor2, Gemma 3; embeddings bge-m3 or Qwen3-Embedding), licence notes, Admin, AI model lifecycle (candidate, evaluated, approved, active, retired). | Server audit results (hardware, VRAM), approval window to download and benchmark (B-03). Arabic and Bangla raise the bar for model choice (see #10). | P3 |
| 10 | Four languages: English, Bahasa Melayu, Arabic and Bangla | Partially implemented | English and Malay end to end (UI, content revisions per locale, colloquial Malay normalisation, language detection). The locale type is a single list, so adding a locale is configuration plus translation, not restructuring. | Arabic (right-to-left layout, fonts, normalisation) and Bangla (script, normalisation) UI strings and content; database locale checks currently allow `en` and `ms` only (one migration); fluent reviewers for each language. | P6 |
| 11 | Voice, video and graphical customer support | Not implemented | Text journey only. Diagrams in Markdown articles are possible today. | Voice input (speech to text) and voice replies, video embeds in flows and articles, graphical step illustrations. Each needs a model or service decision; no paid service without approval. | P7 |
| 12 | AI-generated troubleshooting videos and animations for router and laptop problems | Not implemented | Verified flows are structured step by step, which is the right input for scripted animations. | A generation approach (local tooling or an approved service), a review step so no unverified instruction reaches a video, storage and bandwidth plan. | P7 |
| 13 | Customer journey: find the product, product description, troubleshoot, solution, human support | Implemented and verified for routers | Model picker, model page, mode, scenario, verified steps or staff escalation; product recommendations and descriptions from the catalogue. | Product descriptions for the seven models are empty until BBTech supplies text; laptop journey (P4). | R1, P4 |
| 14 | Flying bee BBCare branding ("always there for you to serve support") | Not implemented | Neutral design system (charcoal, warm neutrals, olive). The AI assistant discloses that it is an AI. | Logo, mascot usage rules, colour decision, favicon and social images. Brand assets from the owner or a designer; the assistant must not pretend to be a person even with a mascot. | P1 |
| 15 | Official customer-facing domain `support.bbtech.com.my` | Requires owner or business data or approval | Deployment image, compose, Nginx and Cloudflare Tunnel templates, preview gate, `BBCARE_BASE_URL` and allowed-origin handling, deploy and rollback scripts. | DNS record or tunnel route for `support.bbtech.com.my`, TLS, a host (B-04 to B-06), owner approval for any DNS or public exposure change. | P1 (preview) then P8 (production) |

| 16 | Customer demand intelligence and missing-resource tracking (added 2026-10-30) | Implemented and verified | Missing-resource detection at escalation, assistant and typed-description points; grouped demands with every original question, case link, channel and timestamp; Customer Demand Intelligence dashboard with filters; demand detail; staff upload of videos, diagrams, images and documents with second-person approval; approved resources shown to customers and supplied to AI retrieval; usage and feedback tracking; retention of question text (ADR 0009). | Channel data depends on BBTech labelling its links (`?ch=shopee`, `?ch=qr`). AI-interpreted requirements once the AI is activated. | R1 (done), R2 |

Items in the notebook not in the fifteen-point list, kept for completeness:
- "Track clicking website" is covered by #2.
- "Download all customer reply data" and "how many laptop we had, download all laptop data" are #3 and #6.
- "Many video will be there, create AI video, use animation for all kind of router issue, laptop issue" is #12.
- "Customer come, find out the product, description of product, troubleshoot, solution, human support" is #13.

## Master roadmap

Effort is engineering time in the cloud session, excluding waiting for BBTech inputs. S: under a day. M: 1 to 3 days. L: 1 to 2 weeks. XL: more than 2 weeks or needs research first.

### R1. Router first: seven models, Mesh and AP (current)
**Goal:** every one of the 11 scenarios for the 7 models has a verified guide or a clean staff hand-off, with photos.
**Done:** journey, verification workflow, catalogue in every database, tests, CI.
**Remaining:**
| Work | Effort | Depends on | BBTech input |
|---|---|---|---|
| Verify the 13 draft flows and write the missing ones | M per batch, mostly reviewer time | Manuals readable (B-15) or uploaded | Manuals or hands-on test records; reviewer (B-18) |
| Malay translation of flow steps | S per flow | Verified English | Malay translator (B-18) |
| Photos uploaded and verified | S | none | Photos (B-17) |
| Product descriptions for the seven models | S | none | Text from BBTech |
| Identity and compatibility answers | none | none | B-16 answers |
| Router journey analytics events (mode, scenario, outcome) | done 2026-10-30 | none | none |
| Preview site in a browser for cross-device testing | S after host exists | B-04 to B-06 | Host, address, secrets on host |

### R2. Local AI on verified router knowledge
**Goal:** the assistant answers router questions from verified flows through the owner's Flask service, with citations, abstaining otherwise.
| Work | Effort | Depends on | BBTech input |
|---|---|---|---|
| Run the read-only server audit, review results | none (owner runs) | none | B-01 |
| Choose and set up the private network path | S to M | audit | B-02 |
| Register and evaluate a candidate chat model | M | B-03 | Approval window |
| Wire `routerEvidence` into the assistant and the scenario page; router questions in the evaluation set | M | R1 verified flows | none |
| Bilingual answer review and owner activation decision | S | evaluation results | Reviewer; owner approval to enable |

### P1. Brand and domain (can run alongside R1)
| Work | Effort | Depends on | BBTech input |
|---|---|---|---|
| Flying bee logo, mascot rules, favicon, social images, colour decision | S to M after assets | none | Logo or designer brief; decision on colours |
| `support.bbtech.com.my` preview behind the gate | S | B-04 to B-06 | DNS or tunnel route; approval |

### P2. Historical knowledge
| Work | Effort | Depends on | BBTech input |
|---|---|---|---|
| Import the owner's ChatGPT export (staged, scrubbed, unverified) | S to run, M to review | pipeline exists | Export files and authorisation (B-13) |
| Promote reviewed answers into verified flows or articles | reviewer time | R1 workflow | Reviewer |
| Scrubbed export of BBCare case history for the owner | S | none | Decision on fields and retention |

### P3. Model evaluation and learning loop
| Work | Effort | Depends on | BBTech input |
|---|---|---|---|
| Benchmark shortlisted Hugging Face models on the server | M | B-01, B-03 | Approval window; licence acceptance |
| Embeddings model and vector index migration; hybrid retrieval on | M | model choice | Approval |
| Grow the approved example set from resolved cases; decide on fine-tuning with a baseline | ongoing; XL if fine-tuning | R2 live | Reviewer time; owner decision |

### P4. Laptop support (approval required to start)
| Work | Effort | Depends on | BBTech input |
|---|---|---|---|
| Laptop catalogue from the real inventory | M | files | Inventory list, historical laptop data, approval (#6) |
| Laptop scenario catalogue and research, same verified-only rules | L | R1 pattern | Manuals, reviewer |
| Reuse journey, cases and AI for laptops | M | R2 | none |

### P5. Shopee and commerce (approval required)
| Work | Effort | Depends on | BBTech input |
|---|---|---|---|
| Shopee-facing support entry (link from listings to BBCare with model preselected) | S | public site | Listing access |
| Shopee Open Platform or Affiliate integration for price, stock, conversions | L | B-14 | Shopee account authorisation; no scraping |
| Optional behaviour tools (heatmaps) after privacy review | S | legal review | Approval |

### P6. Arabic and Bangla
| Work | Effort | Depends on | BBTech input |
|---|---|---|---|
| Locale list, right-to-left layout, fonts, normalisation for Arabic and Bangla, database locale checks | L | none | Fluent reviewers |
| Translate UI and verified content | ongoing | verified English | Translators |
| Model capability check for both languages | M | P3 | none |

### P7. Voice, video, graphics
| Work | Effort | Depends on | BBTech input |
|---|---|---|---|
| Step illustrations and diagrams in verified flows | M | R1 | Photos or drawings |
| Video embeds (BBTech's own videos) in flows and articles | S | storage decision | Videos |
| Voice input and replies (local speech models only) | L | P3 server capacity | Approval |
| AI-generated troubleshooting animations from verified steps, with review before publishing | XL | P3, R1 | Approval; no paid service without approval |

### P8. Production launch
| Work | Effort | Depends on | BBTech input |
|---|---|---|---|
| Legal and privacy review, DPO (B-10) | none (external) | none | Qualified reviewer |
| Off-site backups (B-11), staging rehearsal, monitoring | M | B-04 | Backup target |
| `main` branch and release pull request (B-12) | S | owner | Approval |
| Production deploy at `support.bbtech.com.my` | S | all above | Explicit approval |

## Dependency summary
```
B-15/B-18 manuals + reviewer -> R1 verified flows -> R2 AI on router knowledge -> P3 learning loop
B-01 audit -> B-02 network -> B-03 models -> R2
B-04..B-06 host -> P1 preview domain -> P8 production
B-13 export -> P2 -> more verified flows
Approval -> P4 laptops (reuses R1, R2)
B-14 -> P5 Shopee
R1 + R2 -> P6 languages, P7 media
```

## Guard rails that apply to every phase
- Customer-facing instructions come only from verified, sourced, published flows or articles.
- No customer message or AI answer becomes training data without staff proposal, a second reviewer and a privacy screen.
- No paid AI or third-party service, no public exposure of the inference service or database, no production change without explicit owner approval.
- The assistant always states it is an AI, whatever the branding.
