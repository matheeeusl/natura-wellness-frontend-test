import { useEffect, useState } from "react";
import { getSubscription, skipNextShipment } from "../api/mockApi";
import { ApiError, type Subscription } from "../api/types";
import { applyChanges, moveChargeDates, rebaseChanges, recordChange, reconcileChanges, type LocalChange } from "./localChanges";
import type { SubscriptionChange } from "./subscriptionChanges";
import { withTimeout } from "./withTimeout";

export type LoadError = "not-found" | "failed";

const simulatedLatency = () => new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 2100));

export function useSubscription() {
  const [server, setServer] = useState<Subscription | null>(null);
  const [changes, setChanges] = useState<LocalChange[]>([]);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [failedLoads, setFailedLoads] = useState(0);

  useEffect(() => {
    let ignore = false;
    withTimeout(getSubscription())
      .then((loaded) => {
        if (!ignore) setServer(loaded);
      })
      .catch((error: unknown) => {
        if (ignore) return;
        setLoadError(error instanceof ApiError && error.status === 404 ? "not-found" : "failed");
        setFailedLoads((failed) => failed + 1);
      });
    return () => {
      ignore = true;
    };
  }, [loadAttempt]);

  const subscription = server && applyChanges(server, changes);
  const frequencyBase = server && applyChanges(server, changes.filter(({ kind }) => kind !== "frequency"));

  function retryLoad() {
    setLoadError(null);
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function refresh() {
    const fresh = await getSubscription();
    const { kept, dropped } = reconcileChanges(changes, fresh);
    setServer(fresh);
    setChanges(kept);
    return { subscription: applyChanges(fresh, kept), droppedChanges: dropped };
  }

  async function skip(): Promise<Subscription> {
    if (!server || !subscription?.nextChargeAt) throw new ApiError(400, "Only active subscriptions can skip a shipment");
    const moved = moveChargeDates(changes, subscription.intervalDays);

    // A subscription resumed or restarted locally is still paused or cancelled on the server.
    if (server.status !== "active") {
      await simulatedLatency();
      setChanges(moved);
      return applyChanges(server, moved);
    }

    const updated = await skipNextShipment({ subscriptionId: server.id, expectedUpdatedAt: server.updatedAt });
    const rebased = rebaseChanges(moved, updated);
    setServer(updated);
    setChanges(rebased);
    return applyChanges(updated, rebased);
  }

  function applyChange(change: SubscriptionChange) {
    if (server) setChanges(recordChange(changes, change, server));
  }

  return { subscription, frequencyBase, loadError, failedLoads, retryLoad, refresh, skip, applyChange };
}

export type SubscriptionControls = Pick<ReturnType<typeof useSubscription>, "refresh" | "skip">;
