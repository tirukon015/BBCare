# 8. Knowledge-Base Import Schema (Proposed)

**Status:** Proposal for review. Nothing is imported. File: [kb-import.json](kb-import.json) (19 draft records).

## 8.1 Record fields
The field list follows the owner's specification. Three extra fields are added and marked "added".

| Field | Type | Required | Notes |
|---|---|---|---|
| `record_id` (added) | string | yes | Stable key, `<ECR>-<CATEGORY>-<TOPIC>` |
| `model_name` | string | yes | Exact catalogue name |
| `ecr_code` | enum | yes | AX20, EX5, EX2, EX8, EB4, KAO, HUA |
| `hardware_revision` | string or null | no | As printed on the label, for example "V3" |
| `firmware_requirements` | string or null | no | For example ">= 1.2.1" |
| `support_category` | enum | yes | `mesh_connection_mode` or `access_point_mode` |
| `supported_feature` | string | yes | For example `easymesh_pairing`, `ethernet_backhaul`, `access_point_mode` |
| `customer_question` | object `{en, ms}` | yes | Canonical question per language. Variants live in the question bank |
| `symptoms` | string[] | yes | |
| `diagnostic_questions` | string[] | yes | Never request secrets |
| `decision_rules` | string[] | yes | |
| `troubleshooting_steps` | string[] | yes | Ordered, low risk first. Empty when unverified |
| `expected_result` | string | yes | |
| `fallback_steps` | string[] | yes | Reset only here, with a warning |
| `warnings` | string[] | yes | Always includes the no-secrets rule |
| `escalation_conditions` | string[] | yes | |
| `source_title` | string | yes | |
| `source_url` | string or null | yes | Null only when no source exists |
| `source_section` | string or null | yes | To be completed by reviewer |
| `verification_status` | enum | yes | `verified`, `official_excerpt`, `official_general`, `community`, `conflicting`, `unverified` |
| `confidence` (added) | enum | yes | `high`, `medium`, `low` |
| `last_verified_at` | ISO date or null | yes | Null until a reviewer reads the source in full |

The Malay text for steps, warnings and rules is not drafted yet. Only the canonical customer question is bilingual. Proposed: BBTech approves the English wording first, then Malay revisions are added per record.

## 8.2 Publication rule (proposed)
Only `verified` records with `last_verified_at` set may be published to customers. All current records are below that level, so none would publish today. This matches BBCare's existing review workflow (draft, review, published).

## 8.3 Mapping to the existing BBCare knowledge schema (for a later, approved import)
| Research field | BBCare target |
|---|---|
| `model_name`, `ecr_code`, `hardware_revision`, `firmware_requirements` | Article applicability (category, model, variant, firmware) |
| `customer_question`, `troubleshooting_steps`, `warnings`, `expected_result`, `fallback_steps` | Article locale revisions (en, ms) |
| `diagnostic_questions`, `decision_rules`, `escalation_conditions` | Troubleshooting flow nodes |
| `source_*` | Knowledge sources linked to the article |
| `verification_status`, `last_verified_at` | Review workflow state |

Catalogue entries for the seven models and their ECR codes would need to exist first. No code or data change is made in this research task.
