import { marked } from "marked";

/*
 * Newsletter HTML in the storefront's look: ivory page, ink text, a serif
 * wordmark and a teal rule. Kept to table-free, inline-styled markup that
 * mail clients render predictably.
 */

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function renderNewsletter(input: { subject: string; preheader: string; bodyMd: string; firstName?: string | null; unsubscribeUrl: string; footerAddress: string }) {
  const body = input.bodyMd.replaceAll("{{firstName}}", input.firstName?.trim() || "there");
  const bodyHtml = marked.parse(body, { async: false, gfm: true, breaks: false }) as string;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(input.subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f2ea;color:#24221f;font-family:Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(input.preheader)}</span>
<div style="max-width:600px;margin:0 auto;padding:40px 28px;">
  <p style="margin:0 0 28px;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:600;letter-spacing:-0.02em;">We<span style="color:#b08d57;">+</span>Make</p>
  <div style="height:1px;background:#0c4b4a;opacity:.35;margin-bottom:28px;"></div>
  <div style="font-size:16px;line-height:1.65;">${bodyHtml}</div>
  <div style="height:1px;background:#ded1bd;margin:36px 0 18px;"></div>
  <p style="margin:0;font-size:12px;line-height:1.6;color:#766d62;">You're receiving this because you joined Notes from the Studio at We+Make.<br>
  ${input.footerAddress ? `${escape(input.footerAddress)}<br>` : ""}<a href="${escape(input.unsubscribeUrl)}" style="color:#0c4b4a;">Unsubscribe</a></p>
</div></body></html>`;
  const text = `${body}\n\n—\nWe+Make\n${input.footerAddress ? `${input.footerAddress}\n` : ""}Unsubscribe: ${input.unsubscribeUrl}\n`;
  return { html, text };
}
