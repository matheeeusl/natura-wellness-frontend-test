import type { Subscription } from "../api/types";
import { t } from "./copy/t";
import { addDays, type SubscriptionChange, type SubscriptionPatch } from "./subscriptionChanges";

/** A customer's change, with the server values it was based on. */
export interface LocalChange extends SubscriptionChange {
  basedOn: SubscriptionPatch;
}

const fieldsOf = (patch: SubscriptionPatch) => Object.keys(patch) as (keyof SubscriptionPatch)[];

const pickFields = (patch: SubscriptionPatch, server: Subscription) =>
  Object.fromEntries(fieldsOf(patch).map((field) => [field, server[field]])) as SubscriptionPatch;

/** Changes that overwrite each other, so a newer one replaces an older one. */
const groupOf = ({ kind }: SubscriptionChange) => (kind === "frequency" || kind === "products" ? kind : "lifecycle");

export function recordChange(changes: LocalChange[], change: SubscriptionChange, server: Subscription): LocalChange[] {
  const others = changes.filter((existing) => groupOf(existing) !== groupOf(change));
  return [...others, { ...change, basedOn: pickFields(change.patch, server) }];
}

export const applyChanges = (server: Subscription, changes: LocalChange[]): Subscription =>
  changes.reduce((subscription, change) => ({ ...subscription, ...change.patch }), server);

/** Splits changes by whether any field they wrote has changed on the server. `updatedAt` alone doesn't count. */
export function reconcileChanges(changes: LocalChange[], fresh: Subscription) {
  const stillValid = ({ basedOn }: LocalChange) =>
    fieldsOf(basedOn).every((field) => JSON.stringify(fresh[field]) === JSON.stringify(basedOn[field]));
  return { kept: changes.filter(stillValid), dropped: changes.filter((change) => !stillValid(change)) };
}

/** The API moves its own date by its own interval, so a date changed locally has to move here too. */
export const moveChargeDates = (changes: LocalChange[], days: number) =>
  changes.map((change) =>
    change.patch.nextChargeAt
      ? { ...change, patch: { ...change.patch, nextChargeAt: addDays(change.patch.nextChargeAt, days) } }
      : change,
  );

/** The customer's own skip changes server values, which shouldn't count against their other changes. */
export const rebaseChanges = (changes: LocalChange[], server: Subscription) =>
  changes.map((change) => ({ ...change, basedOn: pickFields(change.patch, server) }));

export function notKeptMessage({ kind, patch }: LocalChange) {
  switch (kind) {
    case "frequency":
      return t("changeNotKept.frequency", { days: patch.intervalDays ?? "" });
    case "products":
      return t("changeNotKept.products");
    case "cancel":
      return t("changeNotKept.cancel");
    case "resume":
      return t("changeNotKept.resume");
    case "restart":
      return t("changeNotKept.restart");
  }
}
