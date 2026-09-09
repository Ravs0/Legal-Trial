// LexForge Legal-Trial: WhatsApp Cloud API channel adapter (additive only, zero deps).
export type SendResult = { success: boolean; message_id?: string; error?: string; retryable?: boolean };
export class DeadTarget extends Error { retryable = false as const; constructor(m = "dead_target") { super(m); this.name = "DeadTarget"; } }
const MAX = 4096;
const API = "https://graph.facebook.com/v21.0";
function allowlist(): string[] {
  return (process.env.WHATSAPP_ALLOWED_USERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
function split(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += MAX) out.push(text.slice(i, i + MAX));
  return out.length ? out : [""];
}
export async function send(chatId: string, content: string): Promise<SendResult> {
  if (!chatId) return { success: false, error: "dead_target", retryable: false };
  const list = allowlist();
  if (list.length && !list.includes(chatId.trim())) return { success: false, error: "not_allowlisted", retryable: false };
  const token = process.env.WHATSAPP_TOKEN, phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { success: false, error: "not_configured", retryable: false };
  let lastId = "";
  for (const chunk of split(content ?? "")) {
    let res: Response;
    try {
      res = await fetch(`${API}/${phoneId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: chatId, type: "text", text: { body: chunk } }),
      });
    } catch (e) {
      return { success: false, error: String((e as Error)?.message ?? e), retryable: true };
    }
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      let detail = `whatsapp_${res.status}`;
      try { detail = (await res.text()).slice(0, 200) || detail; } catch {}
      return { success: false, error: detail, retryable };
    }
    try {
      const j = (await res.json()) as { messages?: { id?: string }[] };
      lastId = j.messages?.[0]?.id ?? lastId;
    } catch {}
  }
  return { success: true, message_id: lastId || undefined, retryable: false };
}
export default { send, DeadTarget };
