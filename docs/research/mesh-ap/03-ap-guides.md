# 3. Access Point (AP) Mode Guide per Model

AP mode turns the unit into a wireless access point behind an existing router, which keeps doing routing and DHCP. Ask which router stays as the main router before giving steps.

## 3.1 TP-Link Archer AX20 (AX20), official V1 user guide (OE)
1. Sign in to the router's web page.
2. Advanced > System > Operation Mode > select Access Point > Save. The router reboots.
3. Connect the AX20 to the existing router with an Ethernet cable.
4. Open http://tplinkwifi.net and go to Advanced > Quick Setup to finish.

- **Port:** which AX20 port goes to the main router is U. Sources disagree across TP-Link models. Needs BBTech confirmation.
- **Not available in AP mode (OG, FAQ 3774):** Parental Controls, QoS, NAT Forwarding. Access Control is available.
- **Older firmware** may not show the AP option (CM).
- Steps for V2 to V5 are U; the V1 path is the only one sourced.

## 3.2 TP-Link EX510 (EX5)
- AP mode is listed on the product page (OE).
- Menu path: U. The TP-Link router family path is Advanced > System > Operation Mode (OG), but it is not confirmed for this ISP firmware.

## 3.3 TP-Link EX230V (EX2)
- AP mode listed (OE). The ManualsLib manual mentions changing the operation mode under Advanced; the path was not retrieved (U).
- EasyMesh is not available in AP mode (CM). Tell the customer that switching to AP may break an existing mesh (pending confirmation).

## 3.4 TP-Link EX820V (EX8)
- **Conflicting.** TP-Link service-provider and Nordic spec pages list Router Mode only. The ManualsLib manual contains an access point section. Do not give AP steps until BBTech confirms.

## 3.5 TP-Link EB431V (EB4)
- AP mode listed on UK and Nordic spec pages (OE). Steps U.

## 3.6 Kaon AR2140 (KAO)
- **As a Maxis EasyMesh unit:** Network > WAN Mode > Bridge (AP/Repeater) > Apply (OE). See the mesh guide.
- **As a standalone AP behind a non-Maxis router:** only forum reports. One user keeps "Router (AP)", disables DHCP and connects LAN to LAN; others say no true bridge mode exists; VoIP may stop working in bridge mode (CM, CF). Not for customers.

## 3.7 Huawei LG-8245-X6 (HUA)
- No AP or bridge procedure for this model was found. The only sourced bridge behaviour is the automatic switch during EasyMesh pairing (OE). Standalone AP mode: U. Escalate to BBTech or Maxis.

## 3.8 General AP-mode facts (OG)
- In AP mode the upstream router must provide DHCP (FAQ 4167).
- FAQ 4167 said only the Archer AX55 (V1) supported EasyMesh in AP mode at the time of writing. A later community post says EasyMesh became available on more routers in AP mode as a controller. Treat per-model support as U.
