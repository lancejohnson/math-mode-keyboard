// Knowledge map data and logic for the trig course (pure, no DOM). Shown by map.html.
// kind = the type of knowledge a topic builds, and the level it must reach:
//   concept   → understand and explain why (timing model level "Explain & sketch")
//   procedure → carry out the method reliably (level "Fluent")
//   automatic → instant recall, under 3 seconds (level "Automatic")
import { angleIds, status } from './facts.js?v=3';

export const KINDS = {
  concept: { label: 'Concept', goal: 'Explain why, and sketch it', level: 'Explain & sketch' },
  procedure: { label: 'Procedure', goal: 'Do it reliably', level: 'Fluent' },
  automatic: { label: 'Automatic', goal: 'Recall in under 3 seconds', level: 'Automatic' },
};

// needs = real prerequisites (what the topic builds on). The unit still unlocks topics in list order.
export const UNIT1 = {
  unit: 1, title: 'Angles and radians', href: 'unit1.html', storeKey: 'trig-unit1-v2',
  topics: [
    { id: 'turns', title: 'Angles are turns', kind: 'concept', needs: [] },
    { id: 'thirty', title: 'Steps of 30°', kind: 'procedure', needs: ['turns'] },
    { id: 'negative', title: 'Negative angles turn clockwise', kind: 'concept', needs: ['turns'] },
    { id: 'pi', title: 'Radians: π is a half turn', kind: 'concept', needs: ['turns'], facts: [90, 180, 270, 360] },
    { id: 'quarters', title: 'Steps of π/4', kind: 'procedure', needs: ['pi'], facts: [45, 135, 225, 315] },
    { id: 'sixths', title: 'Steps of π/6 and π/3', kind: 'procedure', needs: ['pi', 'thirty'], facts: [30, 60, 120, 150, 210, 240, 300, 330] },
    { id: 'convert', title: 'Switching degrees and radians', kind: 'procedure', needs: ['quarters', 'sixths'] },
    { id: 'by-heart', title: 'Know the 16 angles by heart', kind: 'automatic', needs: ['convert'], facts: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330, 360] },
    { id: 'wrap', title: 'More than a full turn', kind: 'procedure', needs: ['quarters', 'negative'] },
    { id: 'why-pi', title: 'Where π comes from', kind: 'concept', needs: ['pi'] },
    { id: 'arc', title: 'Arc length', kind: 'procedure', needs: ['why-pi', 'convert'] },
  ],
};

// Depth = longest chain of prerequisites, so every arrow points down the page.
export function layers(topics) {
  const by = Object.fromEntries(topics.map(t => [t.id, t])), depth = {};
  const d = id => depth[id] ??= Math.max(-1, ...by[id].needs.map(d)) + 1;
  topics.forEach(t => d(t.id));
  const rows = [];
  topics.forEach(t => (rows[depth[t.id]] ||= []).push(t.id));
  // Order each row by the average position of its prerequisites, so arrows cross less.
  const pos = {};
  rows.forEach(r => {
    const key = id => { const ps = by[id].needs.map(n => pos[n]); return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0; };
    r.sort((a, b) => key(a) - key(b));
    r.forEach((id, i) => pos[id] = (i + 0.5) / r.length);
  });
  return rows;
}

// Progress for one topic. prog = the unit's saved progress, facts = the facts store, now = Date.now().
export function topicState(t, i, topics, prog, facts, now = Date.now()) {
  const done = prog.done?.includes(t.id);
  const open = done || i === 0 || prog.done?.includes(topics[i - 1].id);
  let cards = null;
  if (t.facts) {
    const ids = angleIds(t.facts), n = { new: 0, shaky: 0, slow: 0, automatic: 0 }; let due = 0;
    for (const id of ids) { n[status(facts[id])]++; if (facts[id]?.due && facts[id].due <= now) due++; }
    cards = { total: ids.length, ...n, due };
  }
  const state = done ? (cards?.due ? 'review' : 'mastered') : prog.pred?.[t.id] ? 'learning' : open ? 'open' : 'locked';
  return { state, done, open, cards };
}

export const STATE_TEXT = { mastered: 'Mastered', review: 'Review due', learning: 'In progress', open: 'Ready to start', locked: 'Locked' };
