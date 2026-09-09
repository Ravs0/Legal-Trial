// LexForge Legal-Trial — Telegram + Email channels (additive, dep-free).
// Telegram: Bot API + allowlist + thread stub. Email: nodemailer-free MIME stub (logs in dev).
// TODO: Email delivery via Resend/SES.

export type SendResult = { ok: boolean; messageId?: string; error?: string; skipped?: string };
// NOTE: Dup of api/_lib/channels/whatsapp.ts SendResult — keep fields compatible.

const allowlist = (): string[] =>
  (process.env.TELEGRAM_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function isTelegramAllowed(chatId: string | number): boolean {
  const list = allowlist();
  if (list.length === 0) return true; // open in dev; set TELEGRAM_ALLOWLIST in prod
  return list.includes(String(chatId));
}

export function isQuietHour(d = new Date(), start = 22, end = 8): boolean {
  const s = Number(process.env.QUIET_START_H ?? start);
  const e = Number(process.env.QUIET_END_H ?? end);
  const h = d.getHours();
  return s <= e ? h >= s && h < e : h >= s || h < e;
}

export async function sendTelegram(
  chatId: string | number,
  text: string,
  opts: { threadId?: number; silent?: boolean } = {},
): Promise<SendResult> {
  if (!isTelegramAllowed(chatId)) return { ok: false, error: "telegram_chat_not_allowlisted", skipped: "allowlist" };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV !== "production") console.log("[telegram:dev]", { chatId, threadId: opts.threadId ?? null, text: text.slice(0, 500) });
    return { ok: true, messageId: "dev-stub" };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId, text: text.slice(0, 4000),
        ...(opts.threadId ? { message_thread_id: opts.threadId } : {}), // forum-topic thread stub
        ...(opts.silent || isQuietHour() ? { disable_notification: true } : {}),
      }),
    });
    const data = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
    if (!data.ok) return { ok: false, error: data.description ?? `telegram_${res.status}` };
    return { ok: true, messageId: String(data.result?.message_id ?? "unknown") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "telegram_send_failed" };
  }
}

function buildMime(to: string, subject: string, text: string, html?: string): string {
  const b = `----lexforge-${Date.now().toString(36)}`;
  const head = `From: ${process.env.BRIEF_FROM ?? "LexForge <briefs@example.com>"}\r\nTo: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="${b}"`;
  const t = `--${b}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}\r\n`;
  const h = html ? `--${b}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html}\r\n` : "";
  return `${head}\r\n\r\n${t}${h}--${b}--`;
}

export async function sendEmailBrief(to: string, subject: string, text: string, html?: string): Promise<SendResult> {
  const mime = buildMime(to, subject, text, html);
  if (process.env.NODE_ENV !== "production") console.log("[email:dev]", mime.slice(0, 2000));
  // TODO: deliver via Resend/SES, e.g. POST https://api.resend.com/emails with RESEND_API_KEY.
  if (!process.env.RESEND_API_KEY && !process.env.SES_REGION) return { ok: true, messageId: "mime-stub" };
  return { ok: true, messageId: "mime-stub" };
}
