# Router Mesh and Access Point Troubleshooting Research

**Status:** Research draft for owner and BBTech review. Imported into the application only as unpublished draft flows for staff verification (ADR 0008). Full-source verification still blocked (B-15, rechecked 2026-10-24).
**Research date:** 2026-10-23
**Scope:** Mesh Connection Mode and Access Point (AP) Mode only, for the seven catalogue models below.

| Model (exact catalogue name) | ECR code |
|---|---|
| TP-Link Archer AX20 | AX20 |
| TP-Link EX510 | EX5 |
| TP-Link EX230V | EX2 |
| TP-Link EX820V | EX8 |
| TP-Link EB431V | EB4 |
| Kaon AR2140 | KAO |
| Huawei LG-8245-X6 | HUA |

## Deliverables
| # | Deliverable | File |
|---|---|---|
| 1 | Feature and compatibility matrix | [01-feature-matrix.md](01-feature-matrix.md) |
| 2 | Mesh guide per model | [02-mesh-guides.md](02-mesh-guides.md) |
| 3 | AP guide per model | [03-ap-guides.md](03-ap-guides.md) |
| 4 | Question bank (English and Malay) | [04-question-bank.md](04-question-bank.md) |
| 5 | Decision trees and solutions | [05-decision-trees.md](05-decision-trees.md) |
| 6 | Source register | [06-source-register.md](06-source-register.md) |
| 7 | Unsupported features, missing documents, open questions | [07-gaps-and-open-questions.md](07-gaps-and-open-questions.md) |
| 8 | Knowledge-base import schema and file | [08-kb-import-schema.md](08-kb-import-schema.md), [kb-import.json](kb-import.json) |
| 9 | Summary: verified, uncertain, needs BBTech confirmation | [09-summary.md](09-summary.md) |

## Method and an important limitation
The research environment's network policy blocks direct access to tp-link.com, static.tp-link.com, service-provider.tp-link.com, omadanetworks.com, maxis.com.my, support.huawei.com and manualslib.com. Full manuals and PDFs therefore could not be opened. Every finding comes from web search results, which return short excerpts and summaries of the source pages together with their URLs.

Consequences:
- No record is marked fully verified. The highest level used is **Official excerpt**: the wording was seen in a search excerpt attributed to an official manufacturer or ISP page, but the full page was not read.
- Product images could not be viewed or checked. No image is supplied. Each model lists only the official product page where images can be obtained, and every image field is marked **Unverified**.
- Before import, a reviewer must open each cited source and confirm the wording, section and page.

To complete verification in a later session, allowlist these domains in the environment network settings: `tp-link.com`, `static.tp-link.com`, `service-provider.tp-link.com`, `community.tp-link.com`, `maxis.com.my`, `support.huawei.com`, `manualslib.com`.

## Verification levels
| Level | Meaning | May be shown to customers? |
|---|---|---|
| Official excerpt | Seen in a search excerpt of a manufacturer or ISP document. Full document not read. | Only after a reviewer reads the source and upgrades it to Verified. |
| Official general | From a manufacturer FAQ that covers a family of products, not this exact model. | Only with BBTech confirmation that it applies to the model. |
| Community | Forum or third-party report only. | No. Internal context only. |
| Conflicting | Sources disagree. | No, until resolved. |
| Unverified | No source found. | No. |

## Rules applied
- Exact model names are used throughout. Nothing is renamed or invented.
- Menu names, button presses, indicator meanings, compatibility and reset steps are quoted only where a source supports them. Everything else is marked Unverified.
- No claim that a problem is "common" is made.
- Support flows never ask for Wi-Fi passwords, administrator passwords, one-time codes or other secrets. Where a device's own label credentials are needed, the customer is told to use them on the device and not to share them.
- Low-risk steps come first. A factory reset is always the last step and carries a warning.
