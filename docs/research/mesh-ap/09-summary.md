# 9. Summary

## What is supported by official sources (search excerpts, full documents not yet read)
- **Kaon AR2140 mesh (Maxis manual):** set WAN Mode to Bridge (AP/Repeater), then pair by Ethernet (recommended, yellow LAN to yellow LAN) or WPS. Reset: hold rear button more than 8 seconds.
- **Huawei LG-8245-X6 mesh (Maxis manual):** WLAN/WPS hold of more than 10 seconds on the satellite, 1 to 2 seconds on the main router. Do not open the satellite web page after power-on. Placement guidance. Internet light meaning in router mode.
- **TP-Link ISP models EX510, EX230V, EX820V:** listed in FAQ 4368. Four pairing methods: app, web UI, Ethernet (LAN to WAN), WPS. WPS timing for EX230V and EX820V from FAQ 4352.
- **Archer AX20:** AP mode path for V1. EasyMesh on V3, wired backhaul from firmware 1.2.1 (no downgrade).
- **Specs and modes** for EX510, EX230V, EX820V and EB431V from TP-Link product pages.
- **TP-Link family rules:** mesh families do not interoperate; EasyMesh roaming uses 802.11k/v; AP mode drops Parental Controls, QoS and NAT Forwarding.

## What is uncertain
- AX20 V1 mesh support (conflicting) and V2 (community only).
- EX820V AP mode (spec pages and manual disagree).
- EX230V wired backhaul (disputed) and mesh in AP mode (community).
- EB431V mesh steps (not in FAQ 4368) and all EB431V procedures.
- Huawei identity (LG-8245-X6 vs LG8245X6-10) and any Huawei AP mode.
- Kaon standalone AP mode behind a non-Maxis router.
- LED tables and reset steps for every model except the two items above.
- AP-mode upstream port for all TP-Link models.
- Product images: none could be viewed. All marked Unverified.

## What needs BBTech confirmation
See [07-gaps-and-open-questions.md](07-gaps-and-open-questions.md#73-open-questions-for-bbtech). Highest priority:
1. Model identity and hardware revisions in the field (especially Huawei and AX20 versions).
2. Whether customers should be guided into ISP router web pages, or always escalated.
3. Cross-brand Maxis mesh (Huawei with Kaon).
4. Escalation targets per model.

## Next steps (after review)
1. Allowlist the documentation domains listed in the README, then read each source in full and fill `source_section`.
2. Upgrade records to `verified` where the source confirms the wording.
3. Draft Malay revisions for approved records.
4. Only on explicit owner instruction: import into BBCare as draft articles and flows.
