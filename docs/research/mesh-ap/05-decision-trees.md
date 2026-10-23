# 5. Diagnostic Decision Trees and Solutions

Conventions:
- **Q** = question to the customer, **S** = step, **E** = escalate.
- Ask only the questions needed. Skip a question when the model or a previous answer already settles it.
- Low-risk steps first (check, reposition, power cycle). Settings changes next. Factory reset last, with a warning.
- Never ask for passwords or codes.
- A step marked U is internal guidance only and must be replaced by BBTech-approved wording before customers see it.

**Common entry (all trees):**
- Q0a. Which model is the main router, and which is the second unit? (Map to ECR code.)
- Q0b. For AX20 only: which hardware version is on the label (V1, V2, V3...)?
- If the model is not in the catalogue, stop and escalate (E).

**Standard reset warning (used wherever a reset appears):** "A factory reset erases all settings on that unit, including its Wi-Fi name, mesh pairing and any ISP settings. For ISP-supplied units (Maxis), internet or phone service may need the ISP to restore. Only reset the satellite unit, not the main router, unless BBTech advises otherwise."

---

## Tree 1. Mesh pairing fails
1. Q: Are both units from the same mesh family? Gate by matrix 1.2.
   - AX20 V2: EasyMesh not supported (CM). Explain and stop. E if the customer disputes.
   - AX20 V1: CF. E.
   - Mixed families (OneMesh with EasyMesh, Deco with EasyMesh): not interoperable (OG). Stop.
   - Huawei with Kaon, or Maxis unit with a non-Maxis router: U or CM unreliable. E.
2. S: Place the units 1 to 2 m apart (OE for KAO and HUA; OG "next to" for TP-Link).
3. Model branch:
   - **TP-Link ISP models (EX5, EX2, EX8):** Q: Is EasyMesh enabled on the main router? (OG Advanced > EasyMesh). Then try methods in this order: Ethernet (LAN to agent WAN), WPS (2 seconds on main, then agent within 2 minutes), app, web UI (OG/OE).
   - **KAO:** Q: Has the second unit been set to Bridge (AP/Repeater)? If no, guide that step (OE) using the label details on the device, without sharing them. Then Option 1 Ethernet, else Option 2 WPS.
   - **HUA:** Q: Did you open the second unit's web page after powering it on? If yes, power cycle it and do not open the page (OE warning). Then hold satellite WLAN/WPS more than 10 s, then main 1 to 2 s.
   - **EB4, AX20 V3+:** family steps only (OG). Mark U for EB4.
4. S: For extenders and agents (OG, FAQ 4758): update firmware, temporarily disable Guest Wi-Fi and Multi-SSID on the main router, retry.
5. Expected result: the satellite appears in the network map or app, and its internet light comes on (OG; KAO CM; HUA OE "Internet steady").
6. Fallback: factory reset the **satellite only** with the reset warning, then repeat steps 2 to 3. KAO reset: hold rear reset more than 8 s (OE). Other models: reset procedure U, E.
7. E: still failing after one reset of the satellite, or the main router is involved.

## Tree 2. Node connected but no internet
1. Q: Do devices connected directly to the main router have internet?
   - No: this is a main-router or ISP fault, outside mesh scope. Route to general internet support (excluded from this research). (OG, FAQ 4375 case 1.)
2. Q: What colour and state is the satellite's internet light? (FAQ 4375 case 2 refers to solid or flashing red, OG.) Model-specific meanings: U except HUA Internet light (OE).
3. S: Power cycle the satellite only. Wait for it to restart fully.
4. S: Wired setups: check the cable is seated at both ends and goes into the correct ports (OG FAQ 3925 case 2). Remove any switch between the units as a test.
5. S: Move the satellite closer (halfway point guidance, OE HUA).
6. Q: Do all clients lose connection, including on the main router? If yes, check DHCP on the main router (OG FAQ 4375 case 4). E if the customer cannot do this.
7. Fallback: remove and re-pair (Tree 1).
8. E: persists after re-pair.

## Tree 3. Node offline or disappears
1. Q: Is the satellite powered on? Which lights are on?
2. Q: Did anything change: power cut, moved unit, firmware update, settings change?
3. S: Power cycle the satellite, then wait several minutes.
4. S: If moved, bring it back closer to the main router and test.
5. S: Check the network map: Basic > Network Map (OG FAQ 4758).
6. S: Wired: Tree 5 step checks.
7. Fallback: re-pair (Tree 1). Reset of satellite last.
8. E: unit shows no lights (hardware), or offline returns repeatedly.

## Tree 4. Weak or unstable mesh
1. Q: Where is the satellite placed relative to the main router and the weak area?
2. S: Reposition halfway between router and dead spot, one or two rooms away, away from corners, electronics and metal (OE HUA; OG FAQ 4375 interference).
3. S: If a cable can be run, offer wired backhaul (Tree 5). Maxis KAO manual marks Ethernet as the recommended option (OE).
4. S: Check for firmware updates (OG). Standalone firmware procedures are out of scope; link to the official page only.
5. Q: Is it one device or all devices? One device: device-side issue, outside scope.
6. E: instability continues after placement and wired test.
Note: no claim is made about how often this occurs.

## Tree 5. Wired (Ethernet) backhaul
1. Gate: does the model support wired backhaul? (Matrix 1.2.) AX20 needs V3 with firmware 1.2.1 or later (OE). EX2 CF. EB4 and HUA U: E.
2. Q: Which port on each unit is used?
   - TP-Link ISP models: main LAN to agent WAN (OG FAQ 4368).
   - KAO: yellow LAN to yellow LAN (OE).
   - Note the difference. Do not apply one model's port rule to another.
3. S: Remove any switch or powerline adapter between the units for a test (OG FAQ 3925).
4. S: Try a different known-good cable.
5. Q: Does the app or network map show "wireless" despite the cable? (OG FAQ 3925 case 2.) Power cycle the satellite.
6. Fallback: reset satellite last (warning), re-pair with cable connected.
7. E: still wireless after these steps.

## Tree 6. Roaming
1. Q: Are all units part of one mesh (same network name shown in the app or map)? If they are separate networks with different names, explain that this is not mesh.
2. Info: TP-Link EasyMesh uses 802.11k/v (OG FAQ 3749). EX820V and EB431V list 802.11k/v/r (OE). Client devices make the final roaming decision (general Wi-Fi behaviour; wording to be approved by BBTech).
3. S: Check placement (Tree 4), because poor overlap affects handover.
4. Q: Does it happen on one device only? If yes, device-side, outside scope.
5. E: all devices fail to move between units.
Settings for roaming on each model: U. No toggles are suggested.

## Tree 7. Enable AP mode
1. Q: Which router stays as the main router and provides internet?
2. Model branch:
   - AX20: Advanced > System > Operation Mode > Access Point > Save; reboot; connect by Ethernet; http://tplinkwifi.net; Advanced > Quick Setup (OE, V1). Other versions U.
   - EX5, EB4: AP mode listed (OE); steps U. E for steps.
   - EX2: listed (OE); steps U. Warn that mesh may stop working in AP mode (CM).
   - EX8: CF. E.
   - KAO: only the Maxis EasyMesh bridge is sourced (OE). Standalone AP: E.
   - HUA: U. E.
3. Warn: Parental Controls, QoS and NAT Forwarding are not available in AP mode on TP-Link routers (OG FAQ 3774).
4. E: option missing (possible older firmware, CM).

## Tree 8. AP mode with no internet
1. Q: Do devices on the main router have internet? If no, out of scope.
2. Q: Is the AP cabled to the main router? Which ports? Port rule per model is U except KAO mesh (OE). E if unclear.
3. S: Confirm the main router's DHCP is on (OG FAQ 4167).
4. S: Power cycle the AP. Reconnect the client device.
5. S: Swap the cable.
6. E: still no internet.

## Tree 9. AP mode IP or DHCP conflicts
1. Q: Did the unit stay in router mode while plugged in behind another router? If yes, switch to AP mode (Tree 7), which hands DHCP to the main router.
2. S: Restart client devices to renew addresses.
3. KAO standalone AP (DHCP off, LAN to LAN): CM only. Not for customers.
4. E: any manual IP planning is required.

## Tree 10. AP mode admin access
1. AX20: open http://tplinkwifi.net while connected to the AP (OE).
2. Other models: access method after AP switch is U. E.
3. Never ask for the admin password. If the customer forgot it, the fallback is a reset (warning) or E.

## Tree 11. Failed recovery
Entered when the earlier trees end without success or the customer reports "already reset".
1. Q: What exactly was done, in order? Was the main router or the satellite reset?
2. Q: Lights now? Power present?
3. If the main ISP unit (KAO, HUA, or ISP-configured TP-Link) was reset and internet is lost: E to BBTech or the ISP. Do not guide ISP settings.
4. If the satellite was reset: restart from Tree 1 once.
5. E (always): no lights, repeated failure after one satellite reset, or unit unresponsive.

## Applicability and exclusions
| Tree | Applies to | Excluded or limited, and why |
|---|---|---|
| 1 Pairing | All | AX20 V2 excluded (no EasyMesh, CM). AX20 V1 escalate (CF) |
| 2 No internet | All mesh-capable | Main-router internet loss is out of scope |
| 3 Offline | All mesh-capable | None |
| 4 Weak or unstable | All mesh-capable | General slow Wi-Fi without mesh is out of scope |
| 5 Wired backhaul | AX20 V3 1.2.1+, EX5, EX8, KAO | EX2 CF; EB4, HUA U; AX20 V1/V2 excluded |
| 6 Roaming | All mesh-capable | No per-model settings documented |
| 7 Enable AP | AX20 (V1 sourced), EX5, EX2, EB4 | EX8 CF; KAO standalone and HUA not documented |
| 8 AP no internet | AP-capable | Same as Tree 7 |
| 9 IP/DHCP | AP-capable | Manual IP planning escalated |
| 10 Admin access | AX20 sourced | Others U |
| 11 Recovery | All | None |
