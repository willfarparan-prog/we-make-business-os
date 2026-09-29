import "server-only";
import type { Tool } from "@/lib/anthropic";
import { formatCents } from "@/lib/money";

/*
 * The assistant's grounding: the We+Make voice, then whatever it's looking at.
 * It can propose one kind of change per context, which comes back as a card
 * the owner reviews and applies. It never writes anything itself.
 */

export const BRAND_VOICE = `We+Make is a small-batch design studio making sculptural decor: planters, vases, trays, catchalls and desk objects.
Each piece begins as a precise digital form (3D printed in wood composite and PETG), then is finished by hand: resin cast into cavities, sanded, set with glass or stone mosaic, inlaid with brass-tone detail.
Tagline: "Objects with a point of view." Sign-off line: "Objects for considered living."

VOICE
- Quiet, editorial, confident. Think gallery wall text, not a sales page.
- Short sentences. Concrete, tactile words: lattice, layer, cast, translucent, warm, turquoise resin, brass-tone inlay, ivory frame.
- Talk about form, material, light and how a piece holds space. Let the object do the work.
- "Digital craft" and "digital fabrication" are fine; don't lead with "3D printed" in product copy.
- No exclamation marks, no emoji, no hype ("stunning", "must-have", "game-changer"), no urgency tricks.

NEVER INVENT
- No claims about sustainability, origin, awards, press, customer quotes, sales numbers or discounts unless the owner gives them.
- Prices, lead times, shipping terms and edition sizes come only from the data below.
- Care instructions only if the owner states them.

FORMATS
- Product name: 2–4 words, a proper name plus the object ("Arcadia Tall Planter").
- Material line: materials joined with " · " ("Wood composite · Resin").
- Product description: one or two sentences, under 160 characters.
- Newsletter ("Notes from the studio"): subject under 50 characters; preview text completes the subject's thought; body in Markdown, 80–200 words, may use {{firstName}}.`;

export const PRODUCT_TOOL: Tool = {
  name: "propose_product_copy",
  description:
    "Propose new storefront copy for THIS product for the owner to review and apply with one click. " +
    "Include only the fields you are changing. For questions, ideas or feedback, reply in text instead.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "New product name. Omit if unchanged." },
      material: { type: "string", description: "New material line, materials joined with ' · '. Omit if unchanged." },
      note: { type: "string", description: "New one- or two-sentence description, under 160 characters. Omit if unchanged." },
      rationale: { type: "string", description: "One short sentence: what changed and why." },
    },
    required: ["rationale"],
  },
};

export const NEWSLETTER_TOOL: Tool = {
  name: "propose_newsletter_draft",
  description:
    "Propose a draft or an edit of THIS newsletter for the owner to review and apply. " +
    "Include only the fields you are changing. Applying it sends the campaign back to draft for approval. " +
    "For questions, ideas or feedback, reply in text instead.",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Subject under 50 characters. Omit if unchanged." },
      preheader: { type: "string", description: "Preview text that completes the subject's thought. Omit if unchanged." },
      bodyMd: { type: "string", description: "Full replacement body in Markdown. Omit if unchanged." },
      rationale: { type: "string", description: "One short sentence: what changed and why." },
    },
    required: ["rationale"],
  },
};

const HOW = [
  "You are the studio assistant inside the We+Make business dashboard, talking with the owner.",
  "Be direct and brief. Offer a line of copy, not a lecture.",
  "Follow the voice below exactly; when copy would break a rule, change the copy, not the rule.",
].join("\n");

type ProductForPrompt = { name: string; category: string; material: string; note: string; priceCents: number; leadTime: string; madeToOrder: boolean; editionSize: number | null; status: string };

export function productPrompt(product: ProductForPrompt, others: Array<{ name: string; material: string; note: string }>) {
  return [
    HOW,
    "When the owner asks to change this product's name, material line or description, call propose_product_copy.",
    "",
    "=== WE+MAKE VOICE ===",
    BRAND_VOICE,
    "",
    "=== THIS PRODUCT ===",
    `Name: ${product.name}`,
    `Category: ${product.category}`,
    `Material line: ${product.material}`,
    `Description: ${product.note}`,
    `Price: ${formatCents(product.priceCents)} · ${product.madeToOrder ? `made to order (${product.leadTime})` : "from stock"}${product.editionSize ? ` · edition of ${product.editionSize}` : ""} · ${product.status}`,
    "",
    "=== THE REST OF THE COLLECTION (for consistency) ===",
    ...others.map((other) => `- ${other.name} — ${other.material} — ${other.note}`),
  ].join("\n");
}

type CampaignForPrompt = { subject: string; preheader: string; bodyMd: string; status: string };

export function newsletterPrompt(campaign: CampaignForPrompt, collection: Array<{ name: string; category: string; priceCents: number; note: string }>, shipping: { freeOverCents: number }) {
  return [
    HOW,
    "When the owner asks you to draft or change this newsletter, call propose_newsletter_draft.",
    "",
    "=== WE+MAKE VOICE ===",
    BRAND_VOICE,
    "",
    "=== THIS NEWSLETTER ===",
    `Status: ${campaign.status}`,
    `Subject: ${campaign.subject}`,
    `Preview text: ${campaign.preheader}`,
    "Body:",
    campaign.bodyMd || "(empty)",
    "",
    "=== ON THE STOREFRONT NOW ===",
    ...collection.map((product) => `- ${product.name} (${product.category}, ${formatCents(product.priceCents)}) — ${product.note}`),
    `Shipping: complimentary on domestic orders over ${formatCents(shipping.freeOverCents)}.`,
    "Storefront: https://we-make.vercel.app",
  ].join("\n");
}
