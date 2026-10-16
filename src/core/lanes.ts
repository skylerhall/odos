import { LANES } from '../config';

/** Per-lane speed readings in mph. Lane 0 is the leftmost. */
export type LaneObservation = {
  /** Live speed right now (from lane-level traffic, ODOS drivers, or the camera). */
  live?: number;
  /** Historical speed for this lane at this place and time of week: the "human-flow" pattern. */
  human?: number;
};

/** Lane guidance from map data for the next maneuver (Mapbox Directions `intersections[].lanes`). */
export type LaneGuide = { valid: boolean; active?: boolean; indications: string[] };

export type LaneScore = { index: number; score: number | null; allowed: boolean };

export type LaneAdvice = {
  scores: LaneScore[];
  /** Best lane by the 70/30 blend, or null when there is no speed data. */
  best: number | null;
  /** Best lane by live speed alone. */
  liveBest: number | null;
  /** True when the 30% human-flow factor changed the winner (e.g. the "slow" lane is moving faster). */
  flip: boolean;
  /** A lane change worth making now, after the gain and hold checks. */
  changeTo: number | null;
  /** Plain-language reason for the suggestion. */
  reason: string;
};

function blend(o: LaneObservation): number | null {
  if (o.live == null && o.human == null) return null;
  if (o.live == null) return o.human!;
  if (o.human == null) return o.live;
  return LANES.liveWeight * o.live + LANES.humanWeight * o.human;
}

function argmax(values: (number | null)[], allowed: boolean[]): number | null {
  let best: number | null = null;
  values.forEach((v, i) => {
    if (v == null || !allowed[i]) return;
    if (best == null || v > (values[best] as number)) best = i;
  });
  return best;
}

/**
 * Score lanes: 70% live speed + 30% historical human-flow. Lanes that can't make the next turn
 * (per map lane guidance) are never recommended.
 */
export function scoreLanes(obs: LaneObservation[], allowedLanes?: boolean[]): Omit<LaneAdvice, 'changeTo' | 'reason'> {
  const allowed = obs.map((_, i) => allowedLanes?.[i] ?? true);
  // If guidance says no lane is valid (data glitch), don't lock everything out.
  if (!allowed.some(Boolean)) allowed.fill(true);
  const blended = obs.map(blend);
  const best = argmax(blended, allowed);
  const liveBest = argmax(
    obs.map((o) => o.live ?? null),
    allowed,
  );
  return {
    scores: obs.map((_, i) => ({ index: i, score: blended[i], allowed: allowed[i] })),
    best,
    liveBest,
    flip: best != null && liveBest != null && best !== liveBest,
  };
}

/**
 * Wraps scoreLanes with hysteresis so the suggestion doesn't flicker: a change is only suggested
 * when the new lane is at least `minGainMph` faster than the current one and has stayed best for
 * `holdSeconds`.
 */
export class LaneAdvisor {
  private candidate: number | null = null;
  private since = 0;

  update(obs: LaneObservation[], opts: { allowed?: boolean[]; currentLane?: number | null; now?: number } = {}): LaneAdvice {
    const now = opts.now ?? Date.now();
    const s = scoreLanes(obs, opts.allowed);
    if (s.best !== this.candidate) {
      this.candidate = s.best;
      this.since = now;
    }
    const held = (now - this.since) / 1000 >= LANES.holdSeconds;
    const cur = opts.currentLane;
    let changeTo: number | null = null;
    let reason = 'No lane speed data here yet';

    if (s.best != null) {
      const bestScore = s.scores[s.best].score!;
      if (cur != null && cur !== s.best) {
        const curScore = s.scores[cur]?.score;
        const mustMove = s.scores[cur] && !s.scores[cur].allowed;
        const gain = curScore == null ? Infinity : bestScore - curScore;
        if (mustMove) {
          changeTo = s.best;
          reason = 'Your lane can’t make the next turn';
        } else if (held && gain >= LANES.minGainMph) {
          changeTo = s.best;
          reason = `${laneName(s.best, obs.length)} is ~${Math.round(gain)} mph faster`;
        } else {
          reason = 'Stay in your lane';
        }
      } else if (cur == null && held) {
        reason = `Best lane: ${laneName(s.best, obs.length)}`;
      } else {
        reason = 'You’re in the best lane';
      }
      if (s.flip) reason += ' · human-flow flip';
    }
    return { ...s, changeTo, reason };
  }
}

export function laneName(i: number, count: number): string {
  if (count === 1) return 'Only lane';
  if (i === 0) return 'Left lane';
  if (i === count - 1) return 'Right lane';
  if (count === 3) return 'Middle lane';
  return `Lane ${i + 1} from left`;
}
