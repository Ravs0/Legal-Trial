import { buildLocalPerformanceMetrics } from './aiService';
import type { SessionRecord } from '../types';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const record = {
  id: 'local-coaching-test',
  settings: {},
  startTime: new Date(),
  transcript: [
    {
      id: 'argument-1',
      sender: 'user',
      text: 'The issue is whether the notice denied a hearing. Under Article 21, the record shows no hearing was offered; therefore the order fails. We seek an order setting it aside.',
      timestamp: new Date(),
      meta: {
        kind: 'argument',
        argumentQuality: { score: 9, issue: true, rule: true, facts: true, application: true, remedy: true, respondsToOpponent: false, nextStep: 'Address the opposing argument.' },
      },
    },
    {
      id: 'objection-1',
      sender: 'user',
      text: '[OBJECTION] relevance',
      timestamp: new Date(),
      meta: { kind: 'objection', objection: { grounds: 'Relevance', basis: 'Irrelevant', outcome: 'sustained' } },
    },
  ],
} as unknown as SessionRecord;

const metrics = buildLocalPerformanceMetrics(record);
assert(metrics.argumentStrength >= 8, `expected strong argument score, got ${metrics.argumentStrength}`);
assert(metrics.objectionHandling >= 7, `expected sustained objection credit, got ${metrics.objectionHandling}`);
assert(metrics.feedback.startsWith('Local coaching summary:'), 'fallback must identify itself as local coaching');
assert(metrics.improvementAreas.length > 0, 'fallback should provide a next action');

console.log('aiService tests passed');
