import type { LaneObservation } from './lanes';

/**
 * Simulated lane speeds for Sim mode, so the 70/30 lane model can be seen working before real
 * lane-level data exists. Cycles through three stretches of road every ~45 seconds:
 *  - normal: the left lane is fastest, live and historically
 *  - contrarian: live speeds are about even, but history says the right lane moves better here
 *    (the "slow lane is secretly fast" case, which the 30% human-flow weight picks up)
 *  - left jam: drivers have piled into the left lane and it has bogged down right now
 */
export function simulateLanes(laneCount: number, roadMph: number, tSeconds: number): LaneObservation[] {
  const n = Math.max(1, laneCount);
  const stretch = Math.floor(tSeconds / 45) % 3;
  return Array.from({ length: n }, (_, i) => {
    const leftness = n === 1 ? 0 : 1 - i / (n - 1); // 1 = leftmost, 0 = rightmost
    const noise = Math.sin(tSeconds / 7 + i * 1.7) * 1.5;
    let live = roadMph * (0.95 + 0.06 * leftness) + noise;
    let human = roadMph * (0.92 + 0.1 * leftness);
    if (stretch === 1) {
      live = roadMph * 0.97 + noise;
      human = roadMph * (1.12 - 0.3 * leftness);
    }
    if (stretch === 2 && i === 0 && n > 1) live -= roadMph * 0.3;
    return { live: Math.max(0, live), human: Math.max(0, human) };
  });
}
