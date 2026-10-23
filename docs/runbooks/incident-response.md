# Runbook: Incident Response

1. **Contain.** Turn off AI answers (Admin, AI: turn off `ai_answers.*`) if AI output is involved; disable a compromised staff account (Admin, Users); rotate secrets on the host if leaked.
2. **Preserve evidence.** Export relevant audit log rows (Admin, Audit log) and container logs before restarting anything.
3. **Assess personal data impact.** Which records (cases, support messages, staff accounts) were exposed, how many people, and the likely harm.
4. **Notify.** Under the Personal Data Protection (Amendment) Act 2024, a personal data breach must be notified to the Personal Data Protection Commissioner as soon as practicable, and affected individuals where significant harm is likely. The owner's data protection officer leads this; obtain legal advice on timing and content.
5. **Recover.** Fix the cause, redeploy, restore from backup if data was altered (see rollback runbook).
6. **Review.** Write a short post-incident note in `docs/decisions/` with actions and owners.

Contacts and DPO details: to be completed by the owner (blocker B-10).
