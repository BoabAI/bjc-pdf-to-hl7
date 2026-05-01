import timing from "../../../narration-timing.json";

export type SegmentTiming = {
  sceneId: string;
  file: string;
  duration: number;
  offset: number;
  screenshotId?: string;
};

export type NarrationTiming = {
  segments: SegmentTiming[];
  paddingSeconds: number;
  totalDuration: number;
};

export const Timing: NarrationTiming = timing as NarrationTiming;

export function durationFor(sceneId: string, fps: number): number {
  const seg = Timing.segments.find((s) => s.sceneId === sceneId);
  if (!seg) throw new Error(`No timing segment for sceneId="${sceneId}"`);
  // Scene window = segment duration + padding (so visuals don't cut off mid-breath).
  return Math.ceil((seg.duration + Timing.paddingSeconds) * fps);
}
