# Campaign links and QR codes for BBTech

BBCare records where a visit came from only when the link itself says so, or when the browser sends a referrer. Shopee's app and many browsers send no referrer, so every link BBTech places outside the website should carry a label. Nothing in this document requires any change in BBCare; it is the operating convention for the links BBTech creates.

## The parameters

| Parameter | Purpose | Allowed values |
| --- | --- | --- |
| `ch` | The channel label BBCare trusts first | `shopee`, `qr`, `website`, `direct`, or a short custom word (letters, digits, dash, underscore) |
| `utm_source` | Where the link was placed | `shopee`, `facebook`, `tiktok`, `whatsapp`, `packaging`, `card`, `manual`, `google` |
| `utm_medium` | The kind of placement | `listing`, `chat`, `qr`, `post`, `broadcast`, `insert` |
| `utm_campaign` | The campaign or product the link belongs to | one slug per listing or batch, for example `ar2140-mesh-2026q4` |
| `utm_content` | The individual item so one QR code or card can be told from another | `box-qr-01`, `card-a`, `listing-main-desc` |
| `utm_term` | Optional search or variant term | free, short |

Keep values lowercase with dashes. Do not put names, phone numbers, order numbers or anything about a person in a link: the parameters are stored as sent.

## Patterns

Short forms also work. These two are recognised as Shopee and QR code respectively, without the `ch` label:

```
https://<bbcare-host>/?utm_source=shopee&utm_medium=referral&utm_campaign=bbcare_support
https://<bbcare-host>/?utm_source=qr&utm_medium=offline&utm_campaign=router_support
```

First-touch and latest-touch attribution are kept per browser tab for every visitor and for 30 days only when the visitor allowed analytics (ADR 0009).


Shopee listing description or chat auto-reply:

```
https://<bbcare-host>/?ch=shopee&utm_source=shopee&utm_medium=listing&utm_campaign=<listing-slug>&utm_content=<listing-id>
```

Printed QR code on packaging or a card in the box (one `utm_content` per code so you can see which code was scanned):

```
https://<bbcare-host>/ms/routers/<model-slug>?ch=qr&utm_source=packaging&utm_medium=qr&utm_campaign=<model>-box&utm_content=box-qr-01
```

Direct link to one model and mode, for a support reply:

```
https://<bbcare-host>/en/routers/tp-link-ex230v/ap?ch=direct&utm_source=whatsapp&utm_medium=chat&utm_campaign=support-reply
```

Social post:

```
https://<bbcare-host>/?utm_source=facebook&utm_medium=post&utm_campaign=<post-slug>
```

Model slugs: `tp-link-archer-ax20`, `tp-link-ex510`, `tp-link-ex230v`, `tp-link-ex820v`, `tp-link-eb431v`, `kaon-ar2140`, `huawei-lg-8245-x6`.

## What the dashboards show

- Traffic Sources: sessions per source group (Shopee, Google, other search, social, referral, QR codes, labelled links, unknown) and what those sessions did next.
- Campaign Analytics: sessions, support starts and escalations per `utm_campaign`, and sessions per `utm_content` so a single QR code or card can be evaluated.
- Customer Demand Intelligence and Support Analytics: the same channel on support sessions and cases.

"Unknown" means the browser sent nothing usable and the link carried no label. It is never reported as direct traffic.

## What BBTech needs to do

1. Decide the host name of the public BBCare site (deployment is still pending owner approval).
2. Generate one link per Shopee listing and per printed item with the patterns above, and keep a list of `utm_content` values and where each is used.
3. Generate QR codes from those links with any offline QR tool. BBCare does not need the QR images.
4. Use `?ch=shopee` on every Shopee placement; Shopee's app does not send a referrer.
