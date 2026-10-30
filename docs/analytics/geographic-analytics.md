# Geographic analytics: Malaysia map, location resolution, privacy and setup

Status: application side implemented and tested on 2026-10-30. Production use needs the offline geolocation file on the server (owner action, see the server implementation request) and the legal review named below.

## What it does

- Every analytics event is resolved, in memory and at the moment it arrives, to a country and, for Malaysia, a state code (ISO 3166-2:MY). The network address is used for the lookup and then discarded. It is not written to any analytics table.
- An approximate city is kept only when the visitor allowed analytics in the consent banner, and only for Malaysian ranges whose state is known. No coordinates are stored; the map uses the public-domain state boundaries and their label points.
- The nightly rollup (and the on-open refresh in the admin section) aggregates sessions per state and what those sessions did: page views, new sessions, consented visitors, router selections, Mesh Connection visits, problems chosen, AI chat starts, escalations, support cases, resource opens, video plays, completed guides, top router models, top problems, traffic sources and cities.
- The admin section "Geographic Analytics" shows an interactive choropleth of Malaysia. Selecting a state shows its figures for the chosen period, compared with the previous period. Areas with fewer than 10 sessions are shown as "under 10".
- Honest states: "No geographic visitor data available yet" when the period has no data; a warning when the geolocation file is not configured; sessions whose address is outside the dataset are counted as "Unknown location". A visit is never attributed to a city or coordinate the dataset does not state.

## Accuracy, stated plainly

IP geolocation estimates where a network address is registered or routed, not where a person is. In Malaysia:

- Mobile operators often resolve to Kuala Lumpur or Selangor regardless of the phone's location, so those states are over-represented for mobile visitors.
- VPNs, corporate networks and some ISPs resolve to their exit point, which may be another state or another country.
- City names are the dataset's estimate and are typically right for fixed broadband in large towns and wrong or missing elsewhere.

Treat the map as "where visitors' connections appear to come from", never as a verified physical location.

## Location provider evaluation

| Option | Cost | Account | Accuracy | Data processing | Decision |
| --- | --- | --- | --- | --- | --- |
| DB-IP Lite (CSV, CC BY 4.0), hosted locally | Free, attribution "IP geolocation by DB-IP" required | None (direct download) | Country good; Malaysian state reasonable; city fair | Entirely on the BBCare server; nothing leaves it | Chosen |
| MaxMind GeoLite2 (MMDB), hosted locally | Free | Requires a MaxMind account and licence key; redistribution terms | Similar to DB-IP Lite | On the server | Supported later if the owner opens an account; not needed now |
| IP2Location LITE (CSV), hosted locally | Free | Requires an account | Similar | On the server | Same as above |
| IPinfo, IP2Location API, other hosted APIs | Free tiers are rate-limited (IPinfo 50,000 requests per month); paid beyond that | Account and API key | Similar, with ASN and carrier data | Every visitor address is sent to a third party, which needs a processor review under PDPA and a notice change | Not chosen: recurring cost risk and a third-party transfer of visitor addresses for no accuracy gain |

No paid service, account or key was created. The lookup code accepts the DB-IP Lite country or city CSV as downloaded, or the compact file produced by `infra/scripts/geoip-convert.mjs`, which keeps only country for the world and state and city for Malaysia and merges adjacent ranges so the file stays small enough to hold in memory. IPv4 and IPv6 are supported.

## Map technology evaluation

| Option | Tiles or key | Recurring cost | Decision |
| --- | --- | --- | --- |
| SVG choropleth with d3-geo and bundled Natural Earth boundaries | None | None | Chosen. Works offline, no third-party requests from the admin browser, no key, small (100 KB boundaries) |
| Leaflet with OpenStreetMap tiles | Public OSM tiles are not for production use at volume; a tile provider is needed | Free tiers exist (MapTiler 100,000 loads per month) but require an account and a client-visible key | Not needed: a state choropleth has no use for street tiles |
| MapLibre GL JS with MapTiler or self-hosted vector tiles | Key or self-hosted tile server | Free tier or server work | Not needed for state-level aggregates |
| Mapbox GL JS | Account and token | Free tier, then paid | Rejected: paid dependency and a token in the browser |

Boundaries: Natural Earth 10m "Admin 1 States, Provinces", public domain, filtered to Malaysia's 13 states and 3 federal territories (`apps/web/public/geo/malaysia-states.json`, regenerate with `infra/scripts/geo-boundaries.py`). Coordinates are rounded to three decimals since the map never shows positions.

API integrations required: none. Optional: none. The only external download is the DB-IP Lite file, fetched by the owner on the server.

## Privacy and PDPA controls

- Notice: the customer privacy page (English and Malay) says that an approximate state is estimated from the network address and the address is not stored, and that an approximate city is kept only with analytics consent.
- Consent: state-level aggregation runs for every session as an essential, aggregate measurement with no identifier (ADR 0006). City is consent-gated. No GPS, no browser geolocation API, no fingerprinting.
- Minimum data: `country`, `region` and `city` text columns on the event; no address, no coordinates, no ASN, no carrier.
- Suppression: cells under 10 sessions are shown as "under 10" on the map, in the table and in the city list.
- Access: `analytics.read` plus a verified second factor. Every state drill-down writes an audit entry (`analytics.geo.region`). No per-visitor view exists.
- Retention: raw events 90 days (worker retention job); aggregates keep counts only. Deletion requests follow `docs/runbooks/data-requests.md`.
- Third parties: none receive visitor addresses. If a hosted API is ever considered, it needs a processor review first.
- Legal: the owner should obtain a qualified Malaysian privacy review of the notice, the consent wording and the retention periods before enabling the geolocation file in production. This document is engineering, not legal advice.

## Server setup (owner action; see docs/deployment/geo-analytics-server-request.md)

1. Download the DB-IP Lite city CSV for the current month from https://db-ip.com/db/download/ip-to-city-lite (no account).
2. Convert: `node infra/scripts/geoip-convert.mjs dbip-city-lite-YYYY-MM.csv /etc/bbcare/geoip.csv` and `chmod 640`.
3. Set `BBCARE_GEOIP_CSV=/etc/bbcare/geoip.csv` in the BBCare environment file and restart the web service.
4. Check `GET /api/health/ready` returns `"geo": "configured"` and that Privacy & Tracking Settings shows "Approximate location: Yes".
5. Refresh monthly (DB-IP publishes monthly). Attribution line for the privacy page or footer: "IP geolocation by DB-IP (https://db-ip.com)".

## Pipeline verification

The end-to-end test `apps/web/e2e/geo.spec.ts` sends synthetic events from RFC 5737 test addresses with and without consent, runs the rollup, reads the admin API, renders the map, drills into Selangor, checks the city appears only for the consented session, that an address outside the dataset is "Unknown", that duplicate deliveries do not double count, that an agent gets 403 and that the drill-down is audited. The database test covers the state, country, visitor, new-session, router, mesh, problem, AI, escalation, model, problem, source and city aggregates, idempotency and the absence of address or coordinate columns. Unit tests cover the lookup (compact and DB-IP layouts, IPv6, unknown) and state-name mapping.
