# ADR 0007: Git workflow and checkpoints

**Status:** Accepted, October 2026

**Decision:**
- Development happens on the designated branch `claude/festive-einstein-3g612s`.
- Verified checkpoints (checks green) are committed and pushed frequently, because the cloud session is ephemeral.
- `main` is the intended primary branch. Creating or merging into `main` requires owner action or explicit approval. Work reaches `main` through pull requests reviewed by the owner.
- History on shared branches is never rewritten.
- Secrets are never committed; `.env*` files other than `.env.example` are ignored.
