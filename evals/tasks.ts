export type Task={id:string;kind:"judge"|"counsel";prompt:string;pattern:string;rubric:string};
export const BASELINE=0.75;
export const TASKS:Task[]=[
{id:"judge-issue-spot",kind:"judge",prompt:"Spot issues: contractor sues homeowner over unpaid renovation, counterclaim defective work.",pattern:"breach|damages|warranty|negligence",rubric:"issues,claims,defenses"},
{id:"judge-holding-extract",kind:"judge",prompt:"Extract holding from: court affirms summary judgment on limitations grounds.",pattern:"held|affirm|limitations|summary judgment",rubric:"holding,outcome,reasoning"},
{id:"judge-dicta-filter",kind:"judge",prompt:"Separate holding from dicta in concurrence on punitive damages.",pattern:"holding|dicta|binding|persuasive",rubric:"holding,dicta,clarity"},
{id:"judge-standard-review",kind:"judge",prompt:"Identify standard of review for de novo contract interpretation appeal.",pattern:"de novo|abuse of discretion|clear error",rubric:"standard,application,correctness"},
{id:"judge-precedent-match",kind:"judge",prompt:"Match fact pattern to controlling precedent on offer and acceptance.",pattern:"precedent|controlling|offer|acceptance",rubric:"precedent,analogy,conclusion"},
{id:"judge-remedy-check",kind:"judge",prompt:"Check available remedies for breach of NDA with leaked trade secret.",pattern:"injunction|damages|restitution|disgorgement",rubric:"remedies,availability,limits"},
{id:"judge-dissent-summarize",kind:"judge",prompt:"Summarize dissent arguing majority misreads statute of frauds.",pattern:"dissent|statute of frauds|majority|disagree",rubric:"dissent,argument,fairness"},
{id:"judge-jurisdiction-flag",kind:"judge",prompt:"Flag jurisdiction and venue issues in diversity suit, $80k claim.",pattern:"jurisdiction|venue|diversity|amount in controversy",rubric:"jurisdiction,venue,analysis"},
{id:"judge-citation-verify",kind:"judge",prompt:"Verify citations: Fed R Civ P 12(b)(6), 28 USC 1332 in motion to dismiss.",pattern:"12\\(b\\)\\(6\\)|1332|Twombly|Iqbal",rubric:"citations,accuracy,form"},
{id:"judge-order-draft",kind:"judge",prompt:"Draft order granting in part motion to compel discovery responses.",pattern:"ordered|granted|denied|compel",rubric:"order,clarity,enforceability"},
{id:"counsel-intake",kind:"counsel",prompt:"Intake: new client, landlord-tenant eviction threat, gather facts.",pattern:"parties|facts|goals|deadline",rubric:"facts,goals,risks"},
{id:"counsel-facts-timeline",kind:"counsel",prompt:"Build timeline from client emails about construction delays Jan-Apr.",pattern:"January|February|March|April|delay",rubric:"timeline,completeness,dates"},
{id:"counsel-doc-request",kind:"counsel",prompt:"Draft document request for employment discrimination case.",pattern:"request|produce|documents|interrogator",rubric:"requests,relevance,specificity"},
{id:"counsel-privilege-flag",kind:"counsel",prompt:"Flag privileged communications in mixed business-legal email thread.",pattern:"privileg|work product|confidential|waiver",rubric:"privilege,flagging,caution"},
{id:"counsel-strategy-memo",kind:"counsel",prompt:"Memo: litigation vs mediation for small business contract dispute.",pattern:"litigation|mediation|risk|cost",rubric:"options,risks,recommendation"},
{id:"counsel-fee-estimate",kind:"counsel",prompt:"Estimate fees for drafting will, trust, and powers of attorney.",pattern:"fee|hour|flat|retainer|estimate",rubric:"fees,scope,transparency"},
{id:"counsel-deadline-track",kind:"counsel",prompt:"Track deadlines: answer due 21 days, discovery cutoff, MSJ date.",pattern:"due|deadline|days|discovery|motion",rubric:"deadlines,dates,action"},
{id:"counsel-client-letter",kind:"counsel",prompt:"Write client letter explaining settlement offer trade-offs plainly.",pattern:"settlement|offer|advise|recommend",rubric:"clarity,advice,empathy"},
{id:"counsel-settlement-eval",kind:"counsel",prompt:"Evaluate $50k settlement vs expected judgment $80k at 60% win rate.",pattern:"expected value|risk|settlement|BATNA",rubric:"valuation,risk,advice"},
{id:"counsel-conflict-check",kind:"counsel",prompt:"Conflict check: new client Acme vs former client Globex, same market.",pattern:"conflict|adverse|waiver|screen",rubric:"conflict,parties,resolution"},
];
export const gradeRegex=(t:Task,out:string)=>new RegExp(t.pattern,"i").test(out)?1:0;
export async function gradeLLM(t:Task,out:string):Promise<number>{
const k=process.env.LLM_JUDGE_URL,r=t.rubric.split(",");
if(!k)return r.filter(w=>out.toLowerCase().includes(w.trim())).length/r.length;
const q=await(await fetch(k,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rubric:t.rubric,output:out})})).json();
return Math.max(0,Math.min(1,Number(q.score??0)));
}
export async function run(solver:(t:Task)=>Promise<string>,baseline=BASELINE,out="evals/report.md"){
const rows=await Promise.all(TASKS.map(async t=>{const o=await solver(t);const r=gradeRegex(t,o);const l=await gradeLLM(t,o);return{t,o,s:0.4*r+0.6*l,r,l};}));
const mean=rows.reduce((a,x)=>a+x.s,0)/rows.length;
const{writeFileSync,mkdirSync}=await import("fs");mkdirSync(out.split("/").slice(0,-1).join("/")||".",{recursive:true});
writeFileSync(out,`# LexForge Eval Report\n\nMean: ${mean.toFixed(3)} (baseline ${baseline})\n\n| task | kind | regex | llm | score |\n|---|---|---|---|---|\n${rows.map(x=>`| ${x.t.id} | ${x.t.kind} | ${x.r} | ${x.l.toFixed(2)} | ${x.s.toFixed(2)} |`).join("\n")}\n`);
console.log(`mean=${mean.toFixed(3)} baseline=${baseline}`);
if(mean<baseline-0.05){console.error(`REGRESSION: mean ${mean.toFixed(3)} < ${baseline-0.05}`);process.exit(1);}
}
if(process.argv[1]?.endsWith("tasks.ts"))run(async t=>`${t.rubric} ${t.pattern} response to ${t.prompt}`.slice(0,600));
