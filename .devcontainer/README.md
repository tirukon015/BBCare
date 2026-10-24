# Test BBCare in your browser (GitHub Codespaces)

No installation on your device. Works from Windows, macOS, Android, iPhone and iPad browsers.

1. Open https://github.com/tirukon015/BBCare
2. Switch to branch `claude/festive-einstein-3g612s`.
3. Click **Code**, then the **Codespaces** tab, then **Create codespace on claude/festive-einstein-3g612s**.
4. Wait for setup (first time roughly 3 to 6 minutes). BBCare opens automatically on port 3000; otherwise open the **Ports** tab and click the globe icon next to port 3000.
5. The URL looks like `https://<name>-3000.app.github.dev`. By default it is **private**: only you, signed in to GitHub, can open it. To test on your phone, sign in to GitHub in the phone browser and open the same URL.

What to try:
- `/en` and `/ms`: home with the seven router models. Pick a model, then Mesh or AP, then a problem, or describe it (try "mesh tak boleh pair").
- No guide is verified yet, so each problem shows the intake questions and the staff request form. Submit one and check it at `/en/support/case`.
- `/en/support`: the support assistant (try "EX510 mesh cannot pair").
- `/admin`: staff console. Logins are in `.devcontainer/.preview-login.txt` inside the codespace. Each account sets up an authenticator app on first sign-in.
- AI answers are off. To see the AI flow with the **mock** test provider: Admin, AI, type ENABLE and turn on `ai_answers.en`.

Data: the seven real router models (names and codes only), research imported as unpublished drafts, and synthetic staff accounts. Fictional sample content is used only by automated tests. Do not enter real customer data.

Cost: personal GitHub accounts include a monthly free Codespaces allowance and a default spending limit of USD 0; check github.com/settings/billing. Stop the codespace when finished (Codespaces menu, Stop) to save the allowance.
