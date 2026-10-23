# 2. Mesh Connection Guide per Model

Every step carries its verification level. Steps marked U must not be shown to customers. Never ask the customer for passwords or codes.

## 2.1 TP-Link Archer AX20 (AX20)
**Hardware version gate (ask first).** Mesh support depends on the version printed on the label.
| Version | Mesh | Level |
|---|---|---|
| V1 / V1.2 | Older posts say OneMesh-capable; a 2023 TP-Link reply says the latest V1 firmware does not support OneMesh | CF |
| V2 | No EasyMesh | CM |
| V3 | EasyMesh. Firmware 1.2.1 adds EasyMesh wired backhaul and cannot be downgraded | OE |
| V4.6 | Firmware 1.1.2 lists "Enhanced EasyMesh Compatibility" | OE |
| Other | Check the TP-Link EasyMesh product list | U |

**Pairing (EasyMesh, family procedure, OG: FAQ 3581, 3925):**
1. Confirm both devices support EasyMesh and run current firmware.
2. Confirm EasyMesh is enabled on the main router: Advanced > EasyMesh (OG; on by default).
3. Place the satellite near the main router. The satellite must be in factory state or satellite mode (OG).
4. Add through Basic > Mesh or Advanced > Wireless > Mesh > Add Mesh Device, or by WPS (OG). The exact AX20 menu label is U.

**Warnings:** OneMesh and EasyMesh devices do not interoperate (OG). Firmware 1.2.1 on V3 cannot be downgraded (OE).

## 2.2 TP-Link EX510 (EX5), EX230V (EX2), EX820V (EX8)
These three are listed in FAQ 4368 (EX510 V1, EX230v V1, EX820v V1). The family procedure applies (OG). Model-specific confirmation is needed.

**Preparation (OG):** place the agent next to the controller; factory reset the agent first (this is a reset of the new unit only, which holds no customer settings yet).

**Method A, Aginet app (OG):** + > Add Agent. When the device is found, tap Add as Agent, then Done. Scanning works only between TP-Link ISP-customised models.

**Method B, web UI (OG):** Basic > Mesh or Advanced > Wireless > Mesh > Add Mesh Device. Select the agent and click Add.

**Method C, Ethernet (OG):** cable from the controller's LAN port to the agent's WAN port. The agent's internet light comes on when joined.

**Method D, WPS (OE for EX230v and EX820v, FAQ 4352):** press the controller's WPS button for about 2 seconds, then the agent's within 2 minutes.

**Model notes:**
- EX230V: EasyMesh does not work while the EX230V is in AP mode (CM). Ethernet backhaul support is disputed (CF).
- EX820V: supports 802.11k/v/r (OE). EasyMesh-compatible, not certified (OE).
- EX510: EasyMesh with "seamless roaming and self-healing" (OE). Certification status unclear (CF).

**Extender joining (OG, FAQ 4758):** update firmware, disable Guest Wi-Fi and Multi-SSID, retry WPS, then check Basic > Network Map.

## 2.3 TP-Link EB431V (EB4)
- EasyMesh-compatible (OE). The product page states that some EasyMesh functions are still being developed and will arrive in later software (OE).
- EB431V is not found in the FAQ 4368 model lists. Pairing steps are U. Apply the FAQ 4368 family steps only after BBTech confirms.
- LED meanings: U. A Setup Guide exists (tp-link.com/it/document/27261) but was not readable.

## 2.4 Kaon AR2140 (KAO), Maxis manual
Source: Maxis "How to setup as EasyMesh WiFi 6" (OE).
1. Keep the main router and the second AR2140 1 to 2 m apart during setup.
2. On the second AR2140, open its web page and sign in with the details printed on its own label. The customer types these into the device; BBCare never asks for them.
3. Go to Network > WAN Mode, select **Bridge (AP/Repeater)**, enter a friendly name, click Apply. The unit reboots.
4. Choose one:
   - **Option 1 (recommended): Ethernet.** Connect a yellow LAN port on the EasyMesh unit to a yellow LAN port on the Maxis router. Power both and wait for the WPS lights.
   - **Option 2: WPS.** Press WPS on the main router and on the EasyMesh unit for about 1 to 2 seconds each. Wait for both WPS lights.
5. Community: when the AR2140's internet light comes on, it has joined the mesh (CM).

**Reset (last resort, OE):** hold the rear reset button for more than 8 seconds. This removes the mesh pairing and all settings.
**Cross-brand:** pairing with non-Maxis routers is unreliable (CM).

## 2.5 Huawei LG-8245-X6 (HUA), Maxis manual
Source: Maxis "How to use Wi-Fi 6 Router as Wi-Fi 6 EasyMesh" (OE).
1. Power on both units 1 to 2 m apart.
2. **Do not open the web page of the unit that will become the EasyMesh after it is powered on.** The manual warns that it will otherwise fail to switch to bridge mode.
3. Hold the satellite's WLAN/WPS button for more than 10 seconds, then release.
4. Press the main router's WLAN/WPS button for 1 to 2 seconds. The main router's WLAN light blinks.
5. The satellite restarts with all lights off, switches to bridge mode, and its Internet light then stays steady.
6. Placement: halfway between the router and the dead spot, one or two rooms away, away from corners, electronics and metal.

**Indicators (partial, OE from LG8245X6 quick start):** Internet steady means connected in router mode without traffic; blinking twice per second means connected with traffic. WLAN, WPS, PON and LOS meanings come only from sister models (EG8147X6, EG8145X6) and are U for this model.
