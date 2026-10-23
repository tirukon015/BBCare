# 1. Feature and Compatibility Matrix

Legend: **OE** Official excerpt, **OG** Official general (family FAQ), **CM** Community only, **CF** Conflicting, **U** Unverified. See [README](README.md#verification-levels).

## 1.1 Identity and hardware
| Field | Archer AX20 (AX20) | EX510 (EX5) | EX230V (EX2) | EX820V (EX8) | EB431V (EB4) | Kaon AR2140 (KAO) | Huawei LG-8245-X6 (HUA) |
|---|---|---|---|---|---|---|---|
| Product line | Consumer router | TP-Link ISP-customised (Aginet) | ISP-customised VoIP router | ISP-customised VoIP router | ISP-customised Wi-Fi 7 VoIP router | ISP-supplied router (Maxis) | Fibre ONT/gateway, likely OptiXstar LG8245X6-10 |
| Identity confidence | OE | OE | OE | OE | OE | OE (Maxis manual uses "AR2140") | CF: Maxis uses "LG-8245-X6"; Huawei lists "LG8245X6-10". Needs BBTech confirmation |
| Wi-Fi standard | Wi-Fi 6 (AX1800) | Wi-Fi 6 | Wi-Fi 6 | Wi-Fi 6 (AX6000) | Wi-Fi 7 (BE7200) | Wi-Fi 6 (802.11ax) | Wi-Fi 6 |
| WAN port | 1 GE (OE) | 1 GE (OE) | 1 GE (OE) | 2.5G (OE) | 2.5G (OE) | 1 GE (CM, Speedguide) | Fibre PON uplink (CM, device.report) |
| LAN ports | 4 GE (OE) | 4 GE (OE) | 3 GE (OE) | 1 x 2.5G + 3 GE (OE) | 1 x 2.5G + 3 GE (OE) | 4 GE (CM) | 4 GE (CM) |
| Phone ports | None | U | 1 FXS (OE) | 2 FXS (OE) | 2 (OE) | U (forum mentions VoIP) | U |
| Hardware revisions in scope | V1, V1.2, V2, V3, V4.6, up to V5.60 listed (OE) | V1 (OE, FAQ 4368) | V1 (OE, FAQ 4368) | V1 (OE, FAQ 4368) | U | U | U |
| Official image | Product page only, image U | Product page only, image U | Product page only, image U | Product page only, image U | Product page only, image U | No official manufacturer page found, image U | Huawei support page only, image U |

## 1.2 Mesh capability
| Field | AX20 | EX5 | EX2 | EX8 | EB4 | KAO | HUA |
|---|---|---|---|---|---|---|---|
| Mesh technology | Depends on hardware version. V1: OneMesh claims conflict (CF). V2: no EasyMesh (CM). V3: EasyMesh (OE) | EasyMesh (OE) | EasyMesh-compatible, not certified (OE) | EasyMesh-compatible, not certified (OE) | EasyMesh-compatible (OE). Page notes some EasyMesh functions arrive in later software (OE) | EasyMesh (Maxis manual, OE) | EasyMesh (Maxis manual, OE). Certified per device.report (CM) |
| Can be main (controller) | Yes for V3 (OG) | Yes (OG, FAQ 4368) | Yes (OG, FAQ 4368) | Yes (OG, FAQ 4368) | U | Yes, as the Maxis main router (OE) | Yes, as the Maxis main router (OE) |
| Can be satellite (agent) | U per version | U individually; FAQ 4368 describes adding a reset customised model as agent (OG) | Same as EX5 (OG) | Same as EX5 (OG) | U | Yes, after WAN Mode set to "Bridge (AP/Repeater)" (OE) | Yes, switches to bridge mode by WPS hold (OE) |
| Pairing methods | WPS, web UI (OG, FAQ 3581) | Aginet app, web UI "Add Mesh Device", Ethernet, WPS (OG, FAQ 4368) | Same as EX5 (OG); WPS FAQ 4352 names EX230v (OE) | Same as EX5 (OG); WPS FAQ 4352 names EX820v (OE) | U | Option 1 Ethernet (recommended), Option 2 WPS (OE) | WPS (OE) |
| Wired (Ethernet) backhaul | V3 with firmware 1.2.1 or later (OE). Firmware cannot be downgraded (OE) | Yes, controller LAN to agent WAN (OG, FAQ 4368) | Staff says supported by default; a user disputes it (CF) | Yes per FAQ 4368 method (OG) | U | Yes, yellow LAN to yellow LAN (OE) | U |
| Roaming standards | 802.11k/v for EasyMesh (OG, FAQ 3749) | "Seamless roaming" (OE) | U | 802.11k/v/r (OE) | 802.11k/v/r (OE) | U | U |
| Mesh while in AP mode | U | U | Not supported (CM) | U | U | Not applicable | U |
| Cross-brand mesh | Deco, OneMesh, EasyMesh and Omada do not interoperate (OG, FAQ 3749) | App scanning works only between TP-Link ISP-customised models (OG) | Same as EX5 | Same as EX5 | U | Unreliable with other brands (CM) | Maxis manual says "pair 2 or more Maxis Fibre routers" (OE). Huawei with Kaon: U |

## 1.3 Access Point (AP) mode
| Field | AX20 | EX5 | EX2 | EX8 | EB4 | KAO | HUA |
|---|---|---|---|---|---|---|---|
| AP mode listed | Yes (OE, V1 guide) | Yes, "Router and Access Point" (OE) | Yes (OE) | CF: spec pages say Router Mode only; ManualsLib manual has an AP section | Yes (OE, UK and Nordic spec) | Only as "Bridge (AP/Repeater)" for EasyMesh (OE). Standalone AP behind non-Maxis router: CM only | U. No model-specific document found |
| Menu path | Advanced > System > Operation Mode > Access Point > Save (OE) | U (family path likely similar, not confirmed) | U (manual mentions "change the operation mode", path not retrieved) | U | U | Network > WAN Mode > Bridge (AP/Repeater) > Apply (OE) | U |
| Port to upstream router | U for AX20 (sources disagree across models) | U | U | U | U | Yellow LAN to yellow LAN in mesh Option 1 (OE) | U |
| Features lost in AP mode | Parental Controls, QoS, NAT Forwarding (OG, FAQ 3774) | U | U | U | U | VoIP may stop working in bridge mode (CM) | U |
| Admin access after AP switch | http://tplinkwifi.net, then Advanced > Quick Setup (OE) | U | U | U | U | U | U |

## 1.4 Factory reset (last resort only)
| Model | Documented procedure | Level |
|---|---|---|
| AX20 | Not retrieved | U |
| EX5, EX2, EX8, EB4 | Not retrieved | U |
| KAO | Hold rear reset button for more than 8 seconds. Removes mesh pairing | OE |
| HUA | Not retrieved | U |
