# Runbook: Personal Data Requests (access, correction, deletion, portability)

Customers are anonymous unless they open a case. Requests normally reference a case number (BBC-YYYY-NNNNNN).

- **Access / portability:** support agent opens the case, reveals contact details (audited), and exports the case and its conversation as JSON from the database (`support.cases`, `support.case_events`, `support.messages` for the linked session). Send only to the verified requester.
- **Correction:** update the case through Admin, Cases (note the change).
- **Deletion:** Admin, Cases, "Remove contact details"; delete the linked support session if requested (`DELETE FROM support.sessions WHERE id = ...` by an administrator, recorded in the audit log). Aggregated analytics contain no personal data and are not affected.
- **Withdraw analytics consent:** Privacy page, "Essential only" (removes the visitor identifier in the browser).

Verify identity before acting. Record each request in the audit log.
