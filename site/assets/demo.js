// Demo logic — pure, testable helpers over the generated data.json shape.

export const LIVE_KEY = 'live';

/** Returns the entry (live brief or a simulated ticket) for a key. */
export function selectEntry(data, key) {
  if (!data) return null;
  if (key === LIVE_KEY) return data.live;
  return (data.tickets || []).find((t) => t.key === key) ?? null;
}

/** Budget keys actually present for an entry (live only ships `m`). */
export function availableBudgets(entry) {
  return Object.keys(entry && entry.briefs ? entry.briefs : {});
}

/** Returns the brief for a given budget, or null when unavailable. */
export function selectBrief(entry, budget) {
  if (!entry || !entry.briefs) return null;
  return entry.briefs[budget] ?? null;
}

/** "39/100" or "—" when no numeric score. */
export function formatScore(readiness) {
  const s = readiness && readiness.score;
  return typeof s === 'number' ? `${s}/100` : '—';
}

/** "Critères d'acceptation (−30) — raison" for a readiness gap. */
export function formatGap(gap) {
  const criterion = (gap && gap.criterion) || '';
  const pointsLost = typeof (gap && gap.pointsLost) === 'number' ? gap.pointsLost : null;
  const reason = (gap && gap.reason) || '';
  const cost = pointsLost == null ? '' : ` (−${pointsLost})`;
  return `${criterion}${cost}${reason ? ` — ${reason}` : ''}`;
}

/** "1.4 s" / "820 ms" / "—". */
export function formatDuration(ms) {
  if (typeof ms !== 'number') return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

/** Lines of a brief markdown that contain a masked secret marker. */
export function findSecretLines(markdown) {
  return String(markdown ?? '').split(/\r?\n/).filter((l) => l.includes('[SECRET:'));
}

/** Lines that flag a dropped (rejected) instruction, without reproducing it. */
export function findRejectedLines(markdown) {
  return String(markdown ?? '')
    .split(/\r?\n/)
    .filter((l) => l.includes('écarté(s) du brief') || l.includes('passage(s) écarté(s)'));
}