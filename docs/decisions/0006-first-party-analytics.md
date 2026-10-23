# ADR 0006: First-party analytics, third-party tools off by default

**Status:** Accepted, October 2026

**Decision:** Analytics events are collected by BBCare itself (`POST /api/e`), validated against per-event schemas, scrubbed of personal data, enriched with approximate Malaysian state from an offline IP database at ingestion, and stored without the raw IP. Visitor identifiers are only set with analytics consent. Nightly rollups feed admin dashboards. Microsoft Clarity and similar tools are not loaded unless separately approved after privacy review.

**Consequences:** No data leaves BBCare infrastructure for analytics. No visual session replay at launch.
