// Pure swipe settle decision shared by the row gesture and tests.
// Keep the thresholds identical to the previous inline implementation.

export type TaskSwipeStage = "actions" | "details";

type SwipeSettleInput = {
  startX: number;
  releaseX: number;
  velocityX: number;
  contentWidth: number;
  actionWidth: number;
};

function clamp(value: number, min: number, max: number): number {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

export function resolveSwipeSettle({
  startX,
  releaseX,
  velocityX,
  contentWidth,
  actionWidth,
}: SwipeSettleInput): TaskSwipeStage | null {
  "worklet";
  const projectedX = clamp(releaseX + velocityX * 0.06, -contentWidth, 0);

  if (velocityX > 400 || projectedX > -40) {
    return null;
  }

  if (
    startX < -actionWidth * 1.2 &&
    projectedX > -contentWidth * 0.65
  ) {
    if (projectedX > -actionWidth * 0.8) {
      return null;
    }
    return "actions";
  }

  if (projectedX < -contentWidth * 0.6) {
    return "details";
  }

  if (projectedX < -actionWidth * 0.35) {
    return "actions";
  }

  return null;
}
