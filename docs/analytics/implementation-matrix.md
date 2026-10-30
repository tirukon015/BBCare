# Customer analytics, tracking and business intelligence: implementation matrix

Audit date: 2026-10-30. Branch `claude/festive-einstein-3g612s`. Every "verified" entry was checked by a test that exercises the real path (browser event, ingestion, rollup, dashboard) or by reading the code path end to end, not by the presence of a database column.

Status values: fully implemented and enabled; implemented but disabled; partially implemented; not implemented; blocked by missing configuration or consent; requires BBTech operational input.

## 1. Traffic and sessions

| Requirement | Existing implementation | Enabled? | Missing work | Final status |
| --- | --- | --- | --- | --- |
| Visits, page views, unique sessions | `page_view`, `session_started` events, rollups `sessions`, `page_views`, `landing_pages` | Yes, essential events, no consent needed | None. Definitions written on the Visitors page: a session is one tab visit, not a person | Fully implemented and enabled |
| Returning versus new visitors | `visitor_id` only with analytics consent; rollups `visitors`, `visitors_new` | Per visitor consent | None. Counts are labelled "consented visitors" | Blocked by missing consent (per visitor), implemented |
| Today, yesterday, last 7, 30, 90 days, custom range | Old dashboard had 7, 30, 90 only | Yes | Added `parsePeriod` with today, yesterday, 7, 30, 90 and custom from and to, on every section and the CSV export | Fully implemented and enabled |
| Previous-period comparison | None | Yes | Added `Compare` cards with percentage change for every headline number | Fully implemented and enabled |
| Peak hours | None | n/a | Not built. Aggregates are daily by design (ADR 0006); hourly aggregates would need a new rollup. Low priority, not asked for in the dashboards | Not implemented |
| Device, browser, approximate location | `device_category`, `browser_family`, `os_family`, `country`, `region` from an offline CSV | Device and browser yes. Location only if `BBCARE_GEOIP_CSV` points to a licensed offline database | Owner must provide the database on the server; raw IP is never stored | Blocked by missing configuration (location) |
| Dashboards refresh without the worker | Rollups ran only in the worker or on "Refresh today" | Yes | Added `ensureFreshAggregates()`: every analytics page rolls up today (and yesterday if missing) at most every five minutes | Fully implemented and enabled |

## 2. Traffic sources and campaigns

| Requirement | Existing implementation | Enabled? | Missing work | Final status |
| --- | --- | --- | --- | --- |
| Source classification (Shopee, Google, other search, social, referral, QR, campaign, unknown) | `classifyChannel` on support sessions and cases only (ADR 0009); analytics events stored referrer host and three UTM fields | Partly | Added `channel`, `link_label`, `utm_content`, `utm_term` to `analytics.events` (migration 0006), classification at ingest, `sourceGroup` for reporting, rollups `sources`, `link_labels`, `campaigns`, `campaign_content`, `channel_*` and `campaign_*` conversions | Fully implemented and enabled |
| "Direct" only when reliable | Old `referrers` rollup labelled a missing referrer as "(direct)" | Fixed | Missing referrer is now "(no referrer)" in the legacy metric and "unknown" everywhere else. "direct_link" means an explicit `?ch=direct` label only | Fully implemented and enabled |
| UTM parameters incl. content and term | source, medium, campaign | Yes | content and term added to envelope, storage and rollups | Fully implemented and enabled |
| `?ch=shopee`, `?ch=qr`, `?ch=website` | Supported on support attribution | Yes | Now also recorded on every analytics session and shown in Traffic Sources | Fully implemented and enabled |
| Campaign link convention for BBTech | None | n/a | Written: `docs/analytics/campaign-links.md` | Requires BBTech operational input (create the links and QR codes) |
| Shopee listing and QR attribution in practice | Code ready | Yes | BBTech must put the labelled links on listings, packaging and cards. Shopee strips referrers in its app, so only labelled links attribute reliably | Requires BBTech operational input |

## 3. Website behaviour and click tracking

| Requirement | Existing implementation | Enabled? | Missing work | Final status |
| --- | --- | --- | --- | --- |
| Clicks on navigation, cards, buttons | `ui_click` with `data-track` keys | Yes | None | Fully implemented and enabled |
| Scroll depth, time on page, exits | `navigation_exit` (quarter buckets) | Yes | Exits per page type shown in Behaviour | Fully implemented and enabled |
| Searches and failed searches | `model_search`, `search_no_results` | Yes | None | Fully implemented and enabled |
| Page-to-page navigation paths | None | Yes | Added `nav_paths` rollup (consecutive page types within a session) | Fully implemented and enabled |
| Form interactions | Only submit outcomes (`escalation_submitted`, `case_followup`) | Yes | Field-level interaction is deliberately not tracked | Fully implemented and enabled (outcomes only) |
| No passwords, tokens, keystrokes | Strict per-event schemas reject unknown properties; `redactSecrets` on case text | Yes | Verified by core tests and the e2e test that types a secret and checks the dashboards | Fully implemented and enabled |

## 4. Heatmaps and journey analytics

| Requirement | Existing implementation | Enabled? | Missing work | Final status |
| --- | --- | --- | --- | --- |
| Most-clicked interface areas | None (third-party heatmaps off by ADR 0006) | Yes | Added `click_area` event: 10 percent grid cell, element kind, viewport bucket; rollup `click_grid`; Heatmaps page renders the grids per page type and device size | Fully implemented and enabled |
| Session recording | None | No | Not built, by decision. No covert recording | Not implemented (by design) |
| Popular navigation paths | None | Yes | `nav_paths` | Fully implemented and enabled |
| Frequently selected models and categories | None | Yes | `router_model_selected`, `router_mode_selected`, rollups and Router Analytics | Fully implemented and enabled |
| Frequently selected problems | None | Yes | `router_scenario_selected` with a `verified` flag; unverified selections are the content gap list | Fully implemented and enabled |
| Abandoned support journeys | None | Yes | `journey_exit` rollup: sessions that chose a problem or started the assistant and neither resolved nor escalated, by last page | Fully implemented and enabled |
| Frequently viewed resources | `resource_open` | Yes | Per-resource table in Media Performance | Fully implemented and enabled |
| Escalation points | `support_escalated` only | Yes | `escalation_submitted` with origin (chat, router, form) and problem | Fully implemented and enabled |

## 5. Visitor, session, case and demand intelligence

| Requirement | Existing implementation | Enabled? | Missing work | Final status |
| --- | --- | --- | --- | --- |
| Website visits vs support sessions vs cases | Separate tables | Yes | All three counted with comparisons on the Visitors page and defined in words | Fully implemented and enabled |
| Known vs anonymous | No customer accounts exist | n/a | Cases carry contact details (90-day retention); everything else is anonymous. The dashboards never claim a session is a unique person | Fully implemented and enabled (as defined) |
| Guide step progress | None | Yes | `flow_step` (next, back, resolved, escalate, restart) per step | Fully implemented and enabled |
| Case follow-ups | None | Yes | `case_followup` (lookup, message) | Fully implemented and enabled |
| Session investigation for staff | Case detail with audited transcript reveal | Yes | Support Analytics lists recent sessions (ids, model, status, channel, case link) for `support.transcripts.read`; message text stays on the case page | Fully implemented and enabled |
| Demand intelligence integrated | Separate section | Yes | Linked in the unified navigation; totals on Overview and Support; demand versus availability and repeat-request reduction on Media Performance | Fully implemented and enabled |

## 6. Media analytics

| Requirement | Existing implementation | Enabled? | Missing work | Final status |
| --- | --- | --- | --- | --- |
| Video opens, progress, completion | `resource_open` only | Yes | `video_progress` at 25, 50, 75, 100 percent from the player position | Fully implemented and enabled |
| Image, diagram, document opens | `resource_open` | Yes | Table by type | Fully implemented and enabled |
| Helpful votes | `resource_feedback` and `/api/public/feedback` | Yes | Shown per resource | Fully implemented and enabled |
| Usage by model and language | None | Yes | Added | Fully implemented and enabled |
| Did a resource reduce repeat requests | None | Yes | Requests before and after fulfilment per requirement | Fully implemented and enabled |
| Real media to measure | Library empty until BBTech uploads | n/a | Upload and approve resources | Requires BBTech operational input |

## 7. Admin section, privacy and configuration

| Requirement | Existing implementation | Enabled? | Missing work | Final status |
| --- | --- | --- | --- | --- |
| Unified "Customer Analytics & Intelligence" with 12 subsections | One Analytics page plus Demand pages | Yes | Overview, Traffic Sources, Visitors & Sessions, Website Behaviour, Customer Journey, Heatmaps, Router Analytics, Support Analytics, Customer Demand Intelligence (existing), Media Performance, Campaign Analytics, Privacy & Tracking Settings, with a shared period picker | Fully implemented and enabled |
| CSV export | 7, 30, 90 days | Yes | Any period including custom | Fully implemented and enabled |
| Privacy notice | `/en/privacy`, `/ms/privacy` | Yes | Review wording against the final tracking list before launch (owner) | Requires BBTech operational input (legal review) |
| Consent banner | Essential vs analytics | Yes | None. Visitor id and 30-day first-touch storage are the only consent-gated items | Fully implemented and enabled |
| Retention | Worker job: events 90 days, security 30, sessions 180, contacts 90, demand question text 180 | Yes when the worker runs | Worker must be scheduled on the server (deployment, B-01 to B-06) | Blocked by missing configuration (worker schedule) |
| Data access and deletion | `docs/runbooks/data-requests.md` | Yes | None | Fully implemented and enabled |
| Configuration audit page | None | Yes | Privacy & Tracking Settings: per feature implemented, enabled, consent, collecting now (real 24-hour counts), dashboard, missing configuration. The page cannot switch tracking on | Fully implemented and enabled |
| PDPA compliance | Engineering controls above | n/a | This is not legal certification. BBTech should have the notice and retention periods reviewed | Requires BBTech operational input |

## Not built, with reasons

- Hourly or peak-hour charts: daily aggregates only. Can be added as a rollup if BBTech needs it.
- Third-party analytics, heatmap or session replay tools: excluded by ADR 0006 and by the brief.
- Cross-device identity or customer accounts: not part of BBCare; the dashboards say so.
- Shopee sales attribution: a click to Shopee is counted as a referral only. Sales figures live in Shopee.
