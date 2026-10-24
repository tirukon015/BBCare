import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword, normalizeModelNumber } from "@bbcare/core";
import type { Sql } from "./client";
import { indexRevision } from "./repos/indexing";
import { importResearchDrafts, seedRouterCatalog, type ResearchRecord } from "./router-catalog";

/**
 * Development and test data.
 *
 * Always: synthetic staff accounts, the router category with the seven authoritative router
 * models, and the mesh/AP research imported as unpublished drafts for staff verification.
 *
 * Only with `samples: true` (automated tests and retrieval evaluations): fictional content
 * ("Nimbus" routers, "Kestrel" laptops) placed in an inactive "sample" category, so it never
 * appears in the customer router catalogue and cannot be mistaken for real product guidance.
 * The only real URL in the samples is the official BBTech Shopee shop page supplied by the owner.
 */

const SAMPLE_NOTE_EN = "> Synthetic sample content for development and testing. Not verified product guidance.";
const SAMPLE_NOTE_MS = "> Kandungan contoh sintetik untuk pembangunan dan ujian. Bukan panduan produk yang disahkan.";
const OFFICIAL_SHOPEE_SHOP = "https://shopee.com.my/bbtech.shop";

export const SEED_USERS = [
  { email: "admin@bbcare.test", name: "Aina Admin", roles: ["admin"] },
  { email: "editor@bbcare.test", name: "Eddie Editor", roles: ["editor"] },
  { email: "reviewer@bbcare.test", name: "Rina Reviewer", roles: ["reviewer"] },
  { email: "agent@bbcare.test", name: "Amir Agent", roles: ["support_agent"] },
  { email: "analyst@bbcare.test", name: "Nadia Analyst", roles: ["analyst"] },
] as const;

export interface SeedOptions {
  /** Password for all seed staff accounts. Generated randomly when omitted. */
  password?: string;
  /** Where to write generated credentials (never committed). */
  credentialsFile?: string | null;
  /** Add fictional sample content for automated tests. Never for previews shown to customers. */
  samples?: boolean;
  /** Research records to import as drafts. Defaults to docs/research/mesh-ap/kb-import.json when present. */
  researchRecords?: ResearchRecord[] | null;
}

export const RESEARCH_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "research", "mesh-ap", "kb-import.json");

async function loadResearch(): Promise<ResearchRecord[]> {
  try {
    const data = JSON.parse(await readFile(RESEARCH_FILE, "utf8")) as { records?: ResearchRecord[] };
    return data.records ?? [];
  } catch {
    return [];
  }
}

type Row = { id: string };

async function one<T extends Row>(p: Promise<T[]>): Promise<string> {
  const rows = await p;
  if (!rows[0]) throw new Error("Expected a row");
  return rows[0].id;
}

export async function seed(sql: Sql, opts: SeedOptions = {}): Promise<{ password: string; created: boolean }> {
  const [existing] = await sql`SELECT 1 FROM catalog.categories LIMIT 1`;
  if (existing) return { password: "", created: false };

  const password = opts.password ?? randomBytes(12).toString("base64url");
  const passwordHash = await hashPassword(password);
  const research = opts.researchRecords === undefined ? await loadResearch() : (opts.researchRecords ?? []);

  await sql.begin(async (tx) => {
    const userIds: Record<string, string> = {};
    for (const u of SEED_USERS) {
      const id = await one(tx<Row[]>`
        INSERT INTO identity.users (email, display_name, password_hash) VALUES (${u.email}, ${u.name}, ${passwordHash}) RETURNING id`);
      userIds[u.email] = id;
      for (const role of u.roles) await tx`INSERT INTO identity.user_roles (user_id, role) VALUES (${id}, ${role})`;
    }
    const editor = userIds["editor@bbcare.test"]!;
    const reviewer = userIds["reviewer@bbcare.test"]!;

    await seedRouterCatalog(tx);
    await importResearchDrafts(tx, research, editor);
    await tx`INSERT INTO ai.models (name, purpose, provider, status, notes) VALUES ('mock-deterministic', 'chat', 'mock', 'candidate', 'Development and test double only. Never for customers.')`;
    if (!opts.samples) return;

    // Fictional samples share one inactive category: never listed in the customer catalogue.
    const sampleCat = await one(tx<Row[]>`INSERT INTO catalog.categories (slug, name_en, name_ms, sort_order, active) VALUES ('sample', 'Synthetic samples (testing only)', 'Contoh sintetik (ujian sahaja)', 99, false) RETURNING id`);
    const router = sampleCat;
    const laptop = sampleCat;
    const nimbus = await one(tx<Row[]>`INSERT INTO catalog.brands (slug, name) VALUES ('nimbus', 'Nimbus (sample)') RETURNING id`);
    const kestrel = await one(tx<Row[]>`INSERT INTO catalog.brands (slug, name) VALUES ('kestrel', 'Kestrel (sample)') RETURNING id`);

    const models: Record<string, string> = {};
    const modelDefs = [
      { key: "nb-ax3000", brand: nimbus, cat: router, number: "NB-AX3000", name: "Nimbus NB-AX3000", year: 2024, aliases: ["AX3000", "nimbus ax3000"], en: "Dual-band Wi-Fi 6 home router (sample).", ms: "Penghala rumah Wi-Fi 6 dwi-jalur (contoh)." },
      { key: "nb-ax3000-pro", brand: nimbus, cat: router, number: "NB-AX3000 Pro", name: "Nimbus NB-AX3000 Pro", year: 2025, aliases: ["AX3000 Pro"], en: "Wi-Fi 6 router with 2.5G port (sample).", ms: "Penghala Wi-Fi 6 dengan port 2.5G (contoh)." },
      { key: "nb-mesh-m2", brand: nimbus, cat: router, number: "NB-M2", name: "Nimbus Mesh M2", year: 2023, aliases: ["mesh m2", "nimbus mesh"], en: "Two-node mesh system (sample).", ms: "Sistem mesh dua nod (contoh)." },
      { key: "nb-lte-4g", brand: nimbus, cat: router, number: "NB-LTE40", name: "Nimbus LTE40 4G Router", year: 2022, aliases: ["lte40", "4g router nimbus"], en: "4G LTE SIM router (sample).", ms: "Penghala SIM 4G LTE (contoh)." },
      { key: "kestrel-air-14", brand: kestrel, cat: laptop, number: "KA14-G3", name: "Kestrel Air 14 (Gen 3)", year: 2024, aliases: ["kestrel air 14", "air14"], en: "14-inch ultralight laptop (sample).", ms: "Laptop ultraringan 14 inci (contoh)." },
      { key: "kestrel-pro-15", brand: kestrel, cat: laptop, number: "KP15-G2", name: "Kestrel Pro 15 (Gen 2)", year: 2023, aliases: ["kestrel pro 15", "pro15"], en: "15-inch performance laptop (sample).", ms: "Laptop prestasi 15 inci (contoh)." },
      { key: "kestrel-edu-11", brand: kestrel, cat: laptop, number: "KE11", name: "Kestrel Edu 11", year: 2022, aliases: ["edu 11", "kestrel student"], en: "11-inch student laptop (sample).", ms: "Laptop pelajar 11 inci (contoh)." },
    ];
    for (const m of modelDefs) {
      const id = await one(tx<Row[]>`
        INSERT INTO catalog.product_models (brand_id, category_id, model_number, normalized, slug, display_name, summary_en, summary_ms, released_year)
        VALUES (${m.brand}, ${m.cat}, ${m.number}, ${normalizeModelNumber(m.number)}, ${m.key}, ${m.name}, ${m.en}, ${m.ms}, ${m.year}) RETURNING id`);
      models[m.key] = id;
      for (const alias of m.aliases) {
        await tx`INSERT INTO catalog.model_aliases (model_id, alias, normalized) VALUES (${id}, ${alias}, ${normalizeModelNumber(alias)})`;
      }
    }
    await tx`INSERT INTO catalog.product_variants (model_id, label, hardware_revision, region) VALUES (${models["nb-ax3000"]!}, 'v1 (MY)', 'v1', 'MY'), (${models["nb-ax3000"]!}, 'v2 (MY)', 'v2', 'MY')`;
    for (const v of ["1.0.4", "1.1.2", "1.2.0"]) {
      await tx`INSERT INTO catalog.firmware_versions (model_id, version, notes) VALUES (${models["nb-ax3000"]!}, ${v}, 'Synthetic sample firmware entry')`;
    }

    const source = await one(tx<Row[]>`
      INSERT INTO knowledge.sources (kind, title, publisher, trust_level, status, created_by, reviewed_by)
      VALUES ('staff_authored', 'BBCare synthetic sample procedures', 'BBCare development team', 'reviewed', 'approved', ${editor}, ${reviewer}) RETURNING id`);

    const articles = [
      {
        slug: "router-no-internet", cat: router, kind: "troubleshooting", model: null as string | null,
        en: { title: "Router connected but no internet", summary: "Steps to check when devices connect to Wi-Fi but websites do not load.",
          body: `${SAMPLE_NOTE_EN}\n\n## Check the service light\nLook at the internet or WAN light on the router. If it is off or red, the connection from your provider may be down.\n\n## Restart in the right order\nTurn off the router for 30 seconds, then turn it on and wait two minutes before testing again.\n\n## Check cables\nMake sure the cable from the fibre box or modem is firmly connected to the router WAN port.\n\n## When to contact support\nIf the service light stays red after a restart, contact your internet provider or BBTech support with your router model.` },
        ms: { title: "Penghala bersambung tetapi tiada internet", summary: "Langkah semakan apabila peranti bersambung ke Wi-Fi tetapi laman web tidak dimuatkan.",
          body: `${SAMPLE_NOTE_MS}\n\n## Semak lampu perkhidmatan\nLihat lampu internet atau WAN pada penghala. Jika padam atau merah, sambungan daripada penyedia anda mungkin terputus.\n\n## Mulakan semula mengikut susunan\nMatikan penghala selama 30 saat, kemudian hidupkan dan tunggu dua minit sebelum menguji semula.\n\n## Semak kabel\nPastikan kabel daripada kotak fiber atau modem disambung dengan kemas ke port WAN penghala.\n\n## Bila perlu hubungi sokongan\nJika lampu perkhidmatan kekal merah selepas dimulakan semula, hubungi penyedia internet anda atau sokongan BBTech dengan model penghala anda.` },
      },
      {
        slug: "nb-ax3000-slow-wifi", cat: router, kind: "troubleshooting", model: models["nb-ax3000"]!,
        en: { title: "NB-AX3000: slow Wi-Fi in some rooms", summary: "Improve coverage and speed on the Nimbus NB-AX3000 (sample).",
          body: `${SAMPLE_NOTE_EN}\n\n## Placement\nPlace the router in a central, open location away from metal cabinets and microwaves.\n\n## Choose the right band\nUse the 5 GHz network near the router for speed and the 2.4 GHz network for longer range.\n\n## Firmware\nCheck the firmware version in the admin page under System. Only install firmware published by the manufacturer for your exact model and hardware version.\n\n## Still slow\nRun a speed test with a cable connected. If the wired speed is also slow, contact your internet provider.` },
        ms: { title: "NB-AX3000: Wi-Fi perlahan di sesetengah bilik", summary: "Tingkatkan liputan dan kelajuan pada Nimbus NB-AX3000 (contoh).",
          body: `${SAMPLE_NOTE_MS}\n\n## Kedudukan\nLetakkan penghala di lokasi tengah dan terbuka, jauh daripada kabinet logam dan ketuhar gelombang mikro.\n\n## Pilih jalur yang betul\nGunakan rangkaian 5 GHz berhampiran penghala untuk kelajuan dan rangkaian 2.4 GHz untuk jarak lebih jauh.\n\n## Perisian tegar\nSemak versi perisian tegar di halaman pentadbir di bawah System. Pasang hanya perisian tegar yang diterbitkan oleh pengeluar untuk model dan versi perkakasan anda yang tepat.\n\n## Masih perlahan\nJalankan ujian kelajuan dengan kabel disambung. Jika kelajuan berwayar juga perlahan, hubungi penyedia internet anda.` },
      },
      {
        slug: "router-factory-reset", cat: router, kind: "guide", model: null,
        en: { title: "How to factory reset a router safely", summary: "What a factory reset does and how to do it.",
          body: `${SAMPLE_NOTE_EN}\n\n## Before you reset\nA factory reset erases your Wi-Fi name, password and internet settings. Note your internet provider login details first.\n\n## Reset steps\nWith the router powered on, press and hold the reset button for about 10 seconds until the lights flash, then release it.\n\n## After the reset\nConnect to the default Wi-Fi name printed on the router label and run the setup again.` },
        ms: { title: "Cara tetapan semula kilang penghala dengan selamat", summary: "Apa yang dilakukan oleh tetapan semula kilang dan cara melakukannya.",
          body: `${SAMPLE_NOTE_MS}\n\n## Sebelum tetapan semula\nTetapan semula kilang memadam nama Wi-Fi, kata laluan dan tetapan internet anda. Catat butiran log masuk penyedia internet anda terlebih dahulu.\n\n## Langkah tetapan semula\nSemasa penghala dihidupkan, tekan dan tahan butang reset selama kira-kira 10 saat sehingga lampu berkelip, kemudian lepaskan.\n\n## Selepas tetapan semula\nSambung ke nama Wi-Fi lalai yang dicetak pada label penghala dan jalankan persediaan semula.` },
      },
      {
        slug: "laptop-battery-not-charging", cat: laptop, kind: "troubleshooting", model: null,
        en: { title: "Laptop battery not charging", summary: "Common checks when a laptop does not charge.",
          body: `${SAMPLE_NOTE_EN}\n\n## Check the charger\nUse the original charger or one with the correct wattage. Check the cable for damage.\n\n## Safety warning\nIf the battery is swollen, the case is lifting, or you smell burning, stop using the laptop, unplug it, and contact support. Do not try to open or puncture the battery.\n\n## Battery settings\nSome laptops limit charging to protect the battery. Check the battery or power settings for a charge limit option.\n\n## Possible causes\nA worn battery, a faulty charger, or a damaged charging port are possible causes. A technician can confirm the cause.` },
        ms: { title: "Bateri laptop tidak mengecas", summary: "Semakan biasa apabila laptop tidak mengecas.",
          body: `${SAMPLE_NOTE_MS}\n\n## Semak pengecas\nGunakan pengecas asal atau pengecas dengan watt yang betul. Semak kabel untuk kerosakan.\n\n## Amaran keselamatan\nJika bateri membengkak, casing terangkat, atau anda terhidu bau terbakar, berhenti menggunakan laptop, cabut plag, dan hubungi sokongan. Jangan cuba membuka atau menebuk bateri.\n\n## Tetapan bateri\nSesetengah laptop mengehadkan pengecasan untuk melindungi bateri. Semak tetapan bateri atau kuasa untuk pilihan had cas.\n\n## Punca yang mungkin\nBateri haus, pengecas rosak, atau port pengecasan rosak adalah punca yang mungkin. Juruteknik boleh mengesahkan puncanya.` },
        safety: "danger",
      },
      {
        slug: "kestrel-air-14-overheating", cat: laptop, kind: "troubleshooting", model: models["kestrel-air-14"]!,
        en: { title: "Kestrel Air 14: laptop gets hot", summary: "Reduce heat on the Kestrel Air 14 (sample).",
          body: `${SAMPLE_NOTE_EN}\n\n## Airflow\nUse the laptop on a hard, flat surface. Do not block the vents on the bottom and side.\n\n## Background apps\nOpen Task Manager and close apps using high CPU.\n\n## Power mode\nSwitch to the balanced power mode when plugged in.\n\n## When to get help\nIf the laptop shuts down from heat, the fan may need cleaning by a technician.` },
        ms: { title: "Kestrel Air 14: laptop menjadi panas", summary: "Kurangkan haba pada Kestrel Air 14 (contoh).",
          body: `${SAMPLE_NOTE_MS}\n\n## Aliran udara\nGunakan laptop di atas permukaan keras dan rata. Jangan halang lubang udara di bahagian bawah dan sisi.\n\n## Aplikasi latar belakang\nBuka Task Manager dan tutup aplikasi yang menggunakan CPU tinggi.\n\n## Mod kuasa\nTukar kepada mod kuasa seimbang semasa dicas.\n\n## Bila perlu bantuan\nJika laptop mati kerana panas, kipas mungkin perlu dibersihkan oleh juruteknik.` },
        safety: "caution",
      },
    ];

    for (const a of articles) {
      const articleId = await one(tx<Row[]>`
        INSERT INTO knowledge.articles (category_id, slug, kind, created_by) VALUES (${a.cat}, ${a.slug}, ${a.kind}, ${editor}) RETURNING id`);
      for (const locale of ["en", "ms"] as const) {
        const c = a[locale];
        const revId = await one(tx<Row[]>`
          INSERT INTO knowledge.revisions (article_id, locale, revision_no, title, summary, body_md, safety_level, status, author_id, reviewer_id, submitted_at, reviewed_at, published_at)
          VALUES (${articleId}, ${locale}, 1, ${c.title}, ${c.summary}, ${c.body}, ${a.safety ?? "normal"}, 'published', ${editor}, ${reviewer}, now(), now(), now())
          RETURNING id`);
        await tx`INSERT INTO knowledge.revision_sources (revision_id, source_id) VALUES (${revId}, ${source})`;
        if (a.model) await tx`INSERT INTO knowledge.applicability (revision_id, model_id) VALUES (${revId}, ${a.model})`;
        else await tx`INSERT INTO knowledge.applicability (revision_id, category_id) VALUES (${revId}, ${a.cat})`;
        await indexRevision(tx, revId);
      }
    }

    // Draft awaiting review, to exercise the workflow.
    const draftArticle = await one(tx<Row[]>`
      INSERT INTO knowledge.articles (category_id, slug, kind, created_by) VALUES (${router}, 'mesh-m2-add-node', 'guide', ${editor}) RETURNING id`);
    await tx`
      INSERT INTO knowledge.revisions (article_id, locale, revision_no, title, summary, body_md, status, author_id, submitted_at)
      VALUES (${draftArticle}, 'en', 1, 'Mesh M2: add a second node', 'Pair an extra mesh node (sample).', ${`${SAMPLE_NOTE_EN}\n\n## Pairing\nPlace the new node within two rooms of the main node and press the pair button on both units.`}, 'in_review', ${editor}, now())`;

    // Troubleshooting flow
    const flow = await one(tx<Row[]>`
      INSERT INTO knowledge.flows (category_id, slug, title_en, title_ms, status, created_by)
      VALUES (${router}, 'no-internet', 'No internet connection', 'Tiada sambungan internet', 'published', ${editor}) RETURNING id`);
    const steps = [
      { key: "lights", start: true, en: "Is the internet (WAN) light on the router green or white?", ms: "Adakah lampu internet (WAN) pada penghala berwarna hijau atau putih?",
        options: [{ key: "yes", label_en: "Yes", label_ms: "Ya", next: "devices" }, { key: "no", label_en: "No, it is off or red", label_ms: "Tidak, ia padam atau merah", next: "restart" }] },
      { key: "restart", start: false, en: "Turn the router off for 30 seconds, turn it on, and wait two minutes. Is the light green now?", ms: "Matikan penghala selama 30 saat, hidupkan, dan tunggu dua minit. Adakah lampu hijau sekarang?",
        options: [{ key: "yes", label_en: "Yes", label_ms: "Ya", next: "devices" }, { key: "no", label_en: "No", label_ms: "Tidak", outcome: "escalate" }] },
      { key: "devices", start: false, en: "Can other devices load websites?", ms: "Bolehkah peranti lain membuka laman web?",
        options: [{ key: "yes", label_en: "Yes, only one device has a problem", label_ms: "Ya, hanya satu peranti bermasalah", outcome: "resolved_hint" }, { key: "no", label_en: "No", label_ms: "Tidak", outcome: "escalate" }] },
    ];
    for (const s of steps) {
      await tx`
        INSERT INTO knowledge.flow_steps (flow_id, step_key, is_start, prompt_en, prompt_ms, options)
        VALUES (${flow}, ${s.key}, ${s.start}, ${s.en}, ${s.ms}, ${tx.json(s.options)})`;
    }

    // Products and listings
    const products = [
      { sku: "SAMPLE-NB-AX3000", cat: router, brand: nimbus, model: models["nb-ax3000"]!, kind: "device", en: "Nimbus NB-AX3000 router (sample)", ms: "Penghala Nimbus NB-AX3000 (contoh)" },
      { sku: "SAMPLE-NB-MESH-NODE", cat: router, brand: nimbus, model: null, kind: "accessory", en: "Nimbus mesh add-on node (sample)", ms: "Nod tambahan mesh Nimbus (contoh)", compat: [models["nb-mesh-m2"]!, models["nb-ax3000-pro"]!] },
      { sku: "SAMPLE-USBC-65W", cat: laptop, brand: kestrel, model: null, kind: "accessory", en: "65W USB-C charger (sample)", ms: "Pengecas USB-C 65W (contoh)", compat: [models["kestrel-air-14"]!, models["kestrel-edu-11"]!] },
      { sku: "SAMPLE-COOLING-PAD", cat: laptop, brand: null, model: null, kind: "accessory", en: "Laptop cooling pad (sample)", ms: "Pad penyejuk laptop (contoh)", compat: [models["kestrel-air-14"]!, models["kestrel-pro-15"]!] },
    ];
    for (const p of products) {
      const pid = await one(tx<Row[]>`
        INSERT INTO commerce.products (sku, category_id, brand_id, model_id, kind, name_en, name_ms, summary_en, summary_ms)
        VALUES (${p.sku}, ${p.cat}, ${p.brand}, ${p.model}, ${p.kind}, ${p.en}, ${p.ms}, 'Synthetic sample product for testing.', 'Produk contoh sintetik untuk ujian.') RETURNING id`);
      for (const modelId of p.compat ?? []) {
        await tx`
          INSERT INTO commerce.product_compatibility (product_id, model_id, relation, verified_by, verified_at, evidence_source_id)
          VALUES (${pid}, ${modelId}, 'accessory_for', ${reviewer}, now(), ${source})`;
      }
      const listingId = await one(tx<Row[]>`
        INSERT INTO commerce.product_listings (product_id, channel, url, status, last_verified_at, verified_by, created_by)
        VALUES (${pid}, 'shopee', ${`${OFFICIAL_SHOPEE_SHOP}?sample=${p.sku.toLowerCase()}`}, 'active', now(), ${reviewer}, ${editor}) RETURNING id`);
      await tx`INSERT INTO commerce.listing_verifications (listing_id, method, result, note, checked_by) VALUES (${listingId}, 'manual', 'ok', 'Synthetic seed: links to the official BBTech Shopee shop page', ${reviewer})`;
    }

  });

  if (!opts.password && opts.credentialsFile !== null) {
    const file = opts.credentialsFile ?? join(dirname(fileURLToPath(import.meta.url)), "..", ".seed-credentials.txt");
    const lines = [
      "# BBCare synthetic seed accounts (development only, never commit)",
      ...SEED_USERS.map((u) => `${u.email}  roles=${u.roles.join(",")}`),
      `password: ${password}`,
      "MFA enrollment is required at first sign-in.",
    ];
    await writeFile(file, `${lines.join("\n")}\n`, { mode: 0o600 });
  }
  return { password, created: true };
}

