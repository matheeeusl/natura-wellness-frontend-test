import type { CancelReason } from "./subscriptionChanges";

interface TrackEvents {
  cancel_flow_opened: { subscriptionId: string };
  cancel_reason_selected: { subscriptionId: string; reason: CancelReason };
  cancel_offer_shown: { subscriptionId: string; reason: CancelReason };
  cancel_offer_accepted: { subscriptionId: string; reason: CancelReason; offerId: string };
  /** `reason` is null when the customer cancelled without answering. */
  cancel_completed: { subscriptionId: string; reason: CancelReason | null };
  skip_completed: { subscriptionId: string; source: "page" | "cancel_flow" };
}

export function track<E extends keyof TrackEvents>(event: E, payload: TrackEvents[E]) {
  console.log("[track]", event, payload);
}
