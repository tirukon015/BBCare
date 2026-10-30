# Production privacy checklist (Malaysia)

Engineering controls exist and are tested; legal compliance is not confirmed by their existence. Items marked "Owner" or "Adviser" are decisions or reviews that the application side cannot make. Production tracking (`BBCARE_GEOIP_CSV`, analytics consent texts live, AI flags) is not switched on until the marked items are complete.

| # | Item | Status | Who |
| --- | --- | --- | --- |
| 1 | PDPA 2010 and 2024 amendment review of the whole service: lawful basis for essential analytics, consent wording, notices, retention, cross-border (none today), data protection officer appointment | Not started | Owner with a qualified Malaysian adviser (blocker B-10) |
| 2 | Privacy notice (`/en/privacy`, `/ms/privacy`): states what is collected without consent (aggregated, unlinked measurements, approximate state) and with consent (returning-visitor id, approximate city); contact details for the DPO still missing | Draft in code; DPO details pending | Owner, adviser |
| 3 | Analytics consent banner: essential versus analytics, versioned, stored as a consent record; withdrawing removes the visitor id | Implemented and tested | Application |
| 4 | Geographic data processing: address resolved in memory and discarded; state for all, city only with consent; no coordinates; suppression under 10; DB-IP attribution line to add once the file is live | Implemented; attribution line pending owner confirmation | Application, owner |
| 5 | Retention: events 90 days, security 30, sessions and transcripts 180, contact details 90 after closure, retrieval traces 90, demand question text 180; applied by the worker nightly | Implemented; needs the worker running on the host | Antigravity (deploy), adviser (periods) |
| 6 | User rights and deletion: `docs/runbooks/data-requests.md` covers access, correction and deletion by case reference and support session; staff perform it with audit | Implemented as a procedure | Owner to assign a responsible person |
| 7 | Access controls: staff RBAC, second factor, transcript permission separate from aggregates, geo drill-down audited, no per-visitor view | Implemented and tested | Application |
| 8 | Audit history: identity.audit_logs append-only; admin Audit log page | Implemented | Application |
| 9 | Third-party provider review: none receive visitor data (no analytics, map, geolocation or AI provider outside the host). Shopee links are outbound only. Any future hosted API needs a processor review first | Current state confirmed | Owner for any future change |
| 10 | Data security: secrets on host only, mode 600; database not published; TLS at the edge; backups with checksums; off-site target still to choose (B-11) | Partly; off-site pending | Antigravity, owner |
| 11 | Incident response: `docs/runbooks/incident-response.md` with PDPA breach notification step; contacts and DPO to fill in | Procedure drafted; contacts pending | Owner |
| 12 | Malay language review of notice and consent texts | Pending | Owner (B-08) |
| 13 | Staff training on what the dashboards mean (approximate location, not verified position; a session is not a person) | Notes on each dashboard; briefing pending | Owner |

Sign-off: the owner records approval in the GitHub issue before `BBCARE_GEOIP_CSV` is set in production and before any AI flag is turned on.
