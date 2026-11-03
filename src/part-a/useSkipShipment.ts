import { useRef, useState } from "react";
import { ApiError, type Subscription } from "../api/types";
import type { SubscriptionControls } from "./useSubscription";

export type SkipFailure = "conflict" | "inactive" | "error" | "unknown";
type SkipPhase = "skipping" | "refreshing" | "rechecking";

export function useSkipShipment({ refresh, skip }: SubscriptionControls, onSkipped: (updated: Subscription) => void) {
  const locked = useRef(false);
  const [phase, setPhase] = useState<SkipPhase | null>(null);
  const [failure, setFailure] = useState<SkipFailure | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);

  async function run(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    try {
      await work();
    } finally {
      locked.current = false;
      setPhase(null);
    }
  }

  async function settleFailure(conflict: boolean) {
    try {
      const fresh = await refresh();
      if (fresh.status !== "active") setFailure("inactive");
      else setFailure(conflict ? "conflict" : "error");
    } catch {
      setFailure("unknown");
    }
  }

  const submit = () =>
    run(async () => {
      setFailure(null);
      setPhase("skipping");
      try {
        onSkipped(await skip());
      } catch (error) {
        const conflict = error instanceof ApiError && error.status === 409;
        setFailedAttempts((attempts) => attempts + 1);
        if (conflict) setPhase("refreshing");
        await settleFailure(conflict);
      }
    });

  const recheck = () =>
    run(async () => {
      setPhase("rechecking");
      await settleFailure(false);
    });

  return { phase, failure, failedAttempts, busy: phase !== null, submit, recheck };
}

export type SkipShipment = ReturnType<typeof useSkipShipment>;
