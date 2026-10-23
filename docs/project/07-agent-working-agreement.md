# 07. Coding Agent Working Agreement

## Required workflow
1. Read all project documents.
2. Audit the repository and environment before changes.
3. Separate facts, assumptions, and recommendations.
4. Present plan, file changes, dependencies, risks, and tests.
5. Stop and wait for explicit approval before implementation.
6. Implement only the approved scope.
7. Run checks and report actual results.
8. Update documentation and decision log for approved changes.
9. Report files changed, commands run, test results, limitations, and next step.

## No-go rules
- No implementation before approval.
- No deploy, push, or production change without separate explicit approval.
- Do not modify RPOMS, Print Engine, or unrelated projects.
- Do not delete/overwrite files without approval.
- Do not use production data for tests.
- Never fabricate audit counts or test results.
- Do not silently change architecture or dependencies.
- Do not expose secrets or customer data.
- Do not publish unverified historical answers as authoritative.
- Do not fine-tune before data audit and evaluation justify it.
- Do not give Plotly Cloud unrestricted production database access.

## Before every implementation stage, present
Goal and non-goals; audit findings; files/modules; database/API changes; dependencies/costs; security/privacy impact; tests and acceptance criteria; rollback/recovery; explicit approval request.
