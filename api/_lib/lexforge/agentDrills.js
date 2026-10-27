// Text-sized advocacy drills for the Open Instinct bridge (api/_lib/lexforge/agent.js).
// Each drill targets one scoring dimension from chain.js heuristic(). Prompts
// ask for technique and structure, never assert specific statutory provisions,
// so they cannot go stale or misstate the law.

export const MODES = ["indian", "international"];

export const AGENT_DRILLS = [
  {
    id: "txt-in-bail-opening",
    mode: "indian",
    skill: "clarity",
    prompt:
      "Bail hearing, Sessions Court. Your client is a first-time accused in a property dispute that turned violent. Give the judge a 4 to 6 sentence opening for bail: who your client is, why custody is unnecessary, and what conditions you offer.",
  },
  {
    id: "txt-in-irac-contract",
    mode: "indian",
    skill: "reasoning",
    prompt:
      "A supplier delivered goods two weeks late; the buyer refused them and withheld payment. Argue for the supplier using issue, rule, application, conclusion. Keep it to one short paragraph per step.",
  },
  {
    id: "txt-in-authority-art21",
    mode: "indian",
    skill: "authority",
    prompt:
      "A municipal order demolishes street stalls without notice. Argue for the vendors in 5 to 8 sentences and anchor the argument in constitutional authority and at least one precedent you would rely on. Say what each authority held.",
  },
  {
    id: "txt-in-rebut-delay",
    mode: "indian",
    skill: "rebuttal",
    prompt:
      "Opposing counsel says your writ petition must be dismissed for delay because it was filed 14 months after the order. Rebut in 4 to 6 sentences: distinguish their point, explain the delay, and say why the court should still hear you.",
  },
  {
    id: "txt-in-closing-delivery",
    mode: "indian",
    skill: "delivery",
    prompt:
      "Give a 5 sentence closing for the prosecution in a cheating case built on bank records and two witnesses. Write it exactly as you would say it aloud to the bench.",
  },
  {
    id: "txt-intl-opening-negligence",
    mode: "international",
    skill: "clarity",
    prompt:
      "Jury trial. A cyclist was hit by a delivery van that ran a red light. Give the plaintiff's opening in 4 to 6 sentences: what happened, what you will prove, and what you will ask the jury for.",
  },
  {
    id: "txt-intl-irac-search",
    mode: "international",
    skill: "reasoning",
    prompt:
      "Police searched a car after smelling something they could not identify. Move to suppress the evidence using issue, rule, application, conclusion, one short paragraph per step.",
  },
  {
    id: "txt-intl-authority-hearsay",
    mode: "international",
    skill: "authority",
    prompt:
      "The other side wants to admit a text message from a witness who will not testify. Argue to exclude it in 5 to 8 sentences, citing the rule and at least one precedent, and say what each authority held.",
  },
  {
    id: "txt-intl-rebut-objection",
    mode: "international",
    skill: "rebuttal",
    prompt:
      "You asked a witness about a prior inconsistent statement and opposing counsel objected as improper impeachment. Respond to the objection in 3 to 5 sentences so the judge overrules it.",
  },
  {
    id: "txt-intl-closing-delivery",
    mode: "international",
    skill: "delivery",
    prompt:
      "Give a 5 sentence closing for the defence in a theft case where the only evidence is grainy CCTV. Write it exactly as you would say it aloud to the jury.",
  },
];

export function findDrill(id) {
  return AGENT_DRILLS.find((d) => d.id === id) || null;
}
