# ADR 0010: Mesh Connection only in the customer release, floating assistant on shared infrastructure

**Status:** Accepted, October 2026

**Context:** The owner asked for the first customer-facing release to cover only Mesh Connection problems on the seven supported routers, with a global floating AI chat similar to "Ask SpenDrop", and a sky-blue and blue design. BBCare already had a mesh and AP journey, a support assistant on `/support`, verified-flow retrieval for the assistant, a mock and Flask AI provider behind safety controls, and olive design tokens.

**Decision:**
- Customer pages expose only the modes in `CUSTOMER_SUPPORT_MODES` (currently `mesh`). Choosing a router goes straight to its Mesh Connection problems; `/routers/{model}/ap` and AP problem pages return 404 for customers. The `support_mode` column, the AP scenarios, draft AP flows, admin coverage and evaluations are unchanged, so another category can be released later without changing identifiers.
- The ECR identifier is always displayed with its prefix ("ECR EX5") through one `EcrBadge` component. Database values and the `ecr_code` column are untouched.
- The Mesh Connection problem list grew to eleven entries (first-time setup, pairing, no internet, offline, weak signal, unstable, dropping, restart and retry, wired connection, roaming, still failing). These are categories; each shows verified steps only when a verified flow exists, otherwise the honest "no verified instructions" message and escalation.
- One assistant component (`SupportChat`) serves both the full support page and the floating panel. Both call the same session and message endpoints, the same retrieval, the same AI provider gate and the same validator. The page publishes the selected router, mode, problem and step through a React context; the browser sends them with each message and the server turns them into a support context block for the model and into verified-flow evidence for that problem. The server never trusts the browser for identifiers: unknown modes, scenarios or steps are rejected by the schema.
- Design tokens are semantic (`--color-primary`, `--color-surface-soft` and so on) with the previous names kept as aliases. The suggested primary blue #1677D2 is kept as `--color-brand` for decorative use; text and buttons use #1365B8 because #1677D2 fails WCAG AA on the light sky background.

**Consequences:** No second AI backend and no fake responses: when the AI flag is off the floating panel says so and behaves as the search-first assistant. Customers never select a router twice. AP guidance is not reachable by customers until the owner approves a release that adds it to `CUSTOMER_SUPPORT_MODES`.
