// LexForge Legal-Trial: spaced-repetition due pusher (stub, additive only).
// GET /api/cron/due — overdue cards per user -> channels stub -> ledger stub.
const CARDS = [
  { id: "c1", user: "demo-user", front: "Offer essentials?", back: "Offer+acceptance+consideration", nextReview: 0 },
  { id: "c2", user: "demo-user", front: "Hearsay bar?", back: "Out-of-court statement for truth", nextReview: Date.now() - 1000 },
  { id: "c3", user: "demo-user", front: "Negligence elements?", back: "Duty, breach, causation, damages", nextReview: Date.now() + 86400000 },
];
const LEDGER = []; // executions-ledger rows stub (TODO: persist).
function overdue(now) {
  return CARDS.filter((c) => c.nextReview <= now);
}
function byUser(cards) {
  const m = {};
  for (const c of cards) (m[c.user] ||= []).push(c);
  return m;
}
async function push(user, cards) {
  // TODO wire: real channels (push/email/whatsapp) send here.
  return { user, sent: cards.map((c) => c.id), channel: "stub" };
}
function ledgerRow(user, cards) {
  const row = { ts: new Date().toISOString(), kind: "sr-due", user, cardIds: cards.map((c) => c.id), count: cards.length };
  LEDGER.push(row); // TODO wire: persist to executions ledger store.
  return row;
}
export default async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET only" });
  const got = (req.headers.authorization || "").replace("Bearer ", "") || (req.query && req.query.secret);
  if (!process.env.CRON_SECRET || got !== process.env.CRON_SECRET) return res.status(401).json({ ok: false, error: "unauthorized" });
  const now = Date.now();
  const groups = byUser(overdue(now));
  const sent = [];
  const ledger = [];
  for (const [user, cards] of Object.entries(groups)) {
    sent.push(await push(user, cards)); // TODO wire channels.
    ledger.push(ledgerRow(user, cards));
  }
  return res.status(200).json({ ok: true, users: Object.keys(groups).length, sent, ledger });
};
