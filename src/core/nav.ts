// Turn-by-turn progress: where are we on the route, what's next, should we reroute or speak.

import { NAV } from '../config';
import { snapToLine, type LngLat } from './geo';
import type { LaneGuide } from './lanes';
import type { Route, Step } from './route';

export type Progress = {
  along: number;
  /** Distance from the GPS fix to the route line, meters. */
  offset: number;
  snapped: LngLat;
  stepIndex: number;
  step: Step;
  next: Step | null;
  /** Meters to the next maneuver. */
  toManeuver: number;
  remainingMeters: number;
  remainingSeconds: number;
  /** Index of the leg we're on (0 = heading to the first stop). */
  legIndex: number;
  /** Lane guidance for the next intersection that has it, within 2 km. */
  lanesAhead: { lanes: LaneGuide[]; inMeters: number } | null;
  offRoute: boolean;
  arrived: boolean;
};

export class NavTracker {
  private index = 0;
  private offCount = 0;
  private spoken = new Set<string>();
  private lastAlong = 0;

  constructor(readonly route: Route) {}

  update(fix: LngLat): { progress: Progress; speak: string[] } {
    const r = this.route;
    // Search near the last snap first; fall back to a full search if that looks wrong.
    let snap = snapToLine(r.line, fix, this.index, 400);
    if (snap.offset > NAV.offRouteMeters) {
      const full = snapToLine(r.line, fix);
      if (full.offset < snap.offset) snap = full;
    }
    this.index = snap.index;
    this.offCount = snap.offset > NAV.offRouteMeters ? this.offCount + 1 : 0;
    const along = snap.along;

    let stepIndex = r.steps.findIndex((s) => along < s.start + s.distance);
    if (stepIndex === -1) stepIndex = r.steps.length - 1;
    const step = r.steps[stepIndex];
    const next = r.steps[stepIndex + 1] ?? null;
    const stepEnd = step.start + step.distance;

    const stepFrac = step.distance > 0 ? (stepEnd - along) / step.distance : 0;
    const remainingSeconds = step.duration * Math.max(0, stepFrac) + r.steps.slice(stepIndex + 1).reduce((t, s) => t + s.duration, 0);

    const lane = r.lanes.find((l) => l.at >= along - 20 && l.at - along <= 2000);

    // Speak prompts we've just passed (but not ones we skipped over long ago, e.g. after a jump).
    const speak: string[] = [];
    for (const v of step.voice) {
      const key = `${stepIndex}:${v.at.toFixed(0)}`;
      const crossed = v.at <= along && v.at >= this.lastAlong - 50 && along - v.at < 400;
      if (crossed && !this.spoken.has(key)) {
        this.spoken.add(key);
        speak.push(v.text);
      }
    }
    this.lastAlong = along;

    const legIndex = Math.max(
      0,
      r.legEnds.findIndex((end) => along < end - NAV.arriveMeters),
    );

    return {
      progress: {
        along,
        offset: snap.offset,
        snapped: snap.point,
        stepIndex,
        step,
        next,
        toManeuver: Math.max(0, stepEnd - along),
        remainingMeters: Math.max(0, r.line.length - along),
        remainingSeconds,
        legIndex: legIndex === -1 ? r.legEnds.length - 1 : legIndex,
        lanesAhead: lane ? { lanes: lane.lanes, inMeters: Math.max(0, lane.at - along) } : null,
        offRoute: this.offCount >= NAV.offRouteFixes,
        arrived: r.line.length - along < NAV.arriveMeters,
      },
      speak,
    };
  }
}
