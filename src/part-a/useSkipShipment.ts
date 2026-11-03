import { useEffect, useRef, useState } from "react";
import { ApiError, type Subscription } from "../api/types";
import { addDays } from "./subscriptionChanges";
import type { SubscriptionControls } from "./useSubscription";
import { TimeoutError, withTimeout } from "./withTimeout";

export type SkipFailure = "conflict" | "inactive" | "error" | "unknown";
type SkipPhase = "skipping" | "refreshing" | "rechecking";

interface SkipCallbacks {
  onSkipped: (updated: Subscription) => void;
  /** A timed-out skip went through after the customer closed the dialog. */
  onSkippedAfterClose: (updated: Subscription) => void;
}

export function useSkipShipment(subscription: Subscription, { refresh, skip }: SubscriptionControls, callbacks: SkipCallbacks) {
  const locked = useRef(false);
  const mounted = useRef(true);
  const finished = useRef(false);
  const beforeTimeout = useRef<Subscription | null>(null);
  const [phase, setPhase] = useState<SkipPhase | null>(null);
  const [failure, setFailure] = useState<SkipFailure | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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

  function finish(updated: Subscription) {
    if (finished.current) return;
    finished.current = true;
    if (mounted.current) callbacks.onSkipped(updated);
    else callbacks.onSkippedAfterClose(updated);
  }

  /** After a timeout the skip may have landed anyway, and "still on {date}" would be wrong. */
  function landedDuringTimeout(fresh: Subscription) {
    const before = beforeTimeout.current;
    return !!before?.nextChargeAt && fresh.nextChargeAt === addDays(before.nextChargeAt, before.intervalDays);
  }

  async function settleFailure(conflict: boolean) {
    try {
      const fresh = await withTimeout(refresh());
      if (landedDuringTimeout(fresh)) finish(fresh);
      else if (fresh.status !== "active") setFailure("inactive");
      else setFailure(conflict ? "conflict" : "error");
    } catch {
      setFailure("unknown");
    }
  }

  const submit = () =>
    run(async () => {
      finished.current = false;
      beforeTimeout.current = null;
      setFailure(null);
      setPhase("skipping");
      const request = skip();
      try {
        finish(await withTimeout(request));
      } catch (error) {
        setFailedAttempts((attempts) => attempts + 1);
        if (error instanceof TimeoutError) {
          beforeTimeout.current = subscription;
          setFailure("unknown");
          request.then(finish, () => {});
          return;
        }
        const conflict = error instanceof ApiError && error.status === 409;
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
