import { useEffect, useState } from "react";
import { getSubscription, skipNextShipment } from "../api/mockApi";
import { ApiError, type Subscription } from "../api/types";
import { addDays, type SubscriptionPatch } from "./subscriptionChanges";
import { withTimeout } from "./withTimeout";

export type LoadError = "not-found" | "failed";

const simulatedLatency = () => new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 2100));

export function useSubscription() {
  const [server, setServer] = useState<Subscription | null>(null);
  const [patch, setPatch] = useState<SubscriptionPatch>({});
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let ignore = false;
    withTimeout(getSubscription())
      .then((loaded) => {
        if (!ignore) setServer(loaded);
      })
      .catch((error: unknown) => {
        if (!ignore) setLoadError(error instanceof ApiError && error.status === 404 ? "not-found" : "failed");
      });
    return () => {
      ignore = true;
    };
  }, [loadAttempt]);

  const subscription: Subscription | null = server && { ...server, ...patch };

  function retryLoad() {
    setLoadError(null);
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function refresh(): Promise<Subscription> {
    const fresh = await getSubscription();
    setServer(fresh);
    return { ...fresh, ...patch };
  }

  async function skip(): Promise<Subscription> {
    if (!server || !subscription?.nextChargeAt) throw new ApiError(400, "Only active subscriptions can skip a shipment");

    // The API moves its own date by its own interval, so a date changed locally has to move here too.
    const nextPatch = patch.nextChargeAt
      ? { ...patch, nextChargeAt: addDays(subscription.nextChargeAt, subscription.intervalDays) }
      : patch;

    // A subscription resumed or restarted locally is still paused or cancelled on the server.
    if (server.status !== "active") {
      await simulatedLatency();
      setPatch(nextPatch);
      return { ...server, ...nextPatch };
    }

    const updated = await skipNextShipment({ subscriptionId: server.id, expectedUpdatedAt: server.updatedAt });
    setServer(updated);
    setPatch(nextPatch);
    return { ...updated, ...nextPatch };
  }

  function applyChange(change: SubscriptionPatch) {
    setPatch((current) => ({ ...current, ...change }));
  }

  return { subscription, loadError, retryLoad, refresh, skip, applyChange };
}

export type SubscriptionControls = Pick<ReturnType<typeof useSubscription>, "refresh" | "skip">;
