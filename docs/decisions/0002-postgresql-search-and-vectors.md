# ADR 0002: PostgreSQL for data, full-text search, and vectors

**Status:** Accepted, October 2026

**Context:** Need relational integrity, model-number search, bilingual (English and Malay) lexical search, vector retrieval, and background jobs without extra paid infrastructure.

**Options:** Postgres plus a dedicated vector DB (Qdrant, Pinecone); Elasticsearch or Meilisearch; Postgres only.

**Decision:** PostgreSQL 16+ with `pg_trgm` (model numbers, fuzzy aliases), `unaccent` and the `simple` text-search configuration with an English and Malay normalization dictionary (Postgres has no Malay stemmer), and `pgvector` for embeddings. Hybrid ranking by reciprocal rank fusion. Background jobs use a small job table in the same database (`ops.jobs`, claimed with `FOR UPDATE SKIP LOCKED`), which avoids an extra dependency and keeps job creation transactional.

**Consequences:** One system to secure and back up; zero extra cost. Revisit a dedicated vector store only beyond roughly one million chunks.
