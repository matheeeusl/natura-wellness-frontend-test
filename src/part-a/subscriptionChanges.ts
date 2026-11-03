import { catalog, totalAfterDiscount } from "../api/fixtures";
import type { CatalogProduct, Subscription, SubscriptionItem } from "../api/types";
import { t } from "./copy/t";
import { formatCents, formatDate, shortName } from "./format";

/** Fields the mock API can't change, simulated on top of what it returns. */
export type SubscriptionPatch = Partial<
  Pick<Subscription, "status" | "items" | "intervalDays" | "nextChargeAt" | "nextChargeTotalCents" | "pausedUntil" | "cancelledAt">
>;

export type CancelReason = "too-much" | "cost" | "different" | "no-results" | "other";

export type Offer = { id: string; label: string } & ({ kind: "skip" } | { kind: "change"; patch: SubscriptionPatch });

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_IN_MONTH = 30;
const REACTIVATION_DELAY_DAYS = 3;
const LONGER_INTERVALS = [60, 90];
/** The catalog only lists a bundle's contents in its name. */
const BUNDLE_CONTENTS: Record<string, string[]> = {
  "NW-ESSENTIALS": ["NW-VITD-60", "NW-MULTI-30", "NW-MAG-90"],
};

export const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY_MS).toISOString();

const contentsOf = (sku: string) => BUNDLE_CONTENTS[sku] ?? [sku];

const subtotalCents = (items: SubscriptionItem[]) => items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);

export const savingsPerShipmentCents = ({ items, discountPercent }: Subscription) =>
  subtotalCents(items) - totalAfterDiscount(items, discountPercent);

const withItems = (subscription: Subscription, items: SubscriptionItem[]): SubscriptionPatch => ({
  items,
  nextChargeTotalCents: totalAfterDiscount(items, subscription.discountPercent),
});

export const cancelledPatch = (): SubscriptionPatch => ({
  status: "cancelled",
  cancelledAt: new Date().toISOString(),
  nextChargeAt: null,
  nextChargeTotalCents: null,
  pausedUntil: null,
});

export const reactivatedPatch = (subscription: Subscription): SubscriptionPatch => ({
  status: "active",
  cancelledAt: null,
  pausedUntil: null,
  nextChargeAt: addDays(new Date().toISOString(), REACTIVATION_DELAY_DAYS),
  nextChargeTotalCents: totalAfterDiscount(subscription.items, subscription.discountPercent),
});

/** The next charge, formatted for copy. Empty when nothing is scheduled. */
export function nextChargeValues({ nextChargeAt, nextChargeTotalCents }: Pick<Subscription, "nextChargeAt" | "nextChargeTotalCents">) {
  if (!nextChargeAt || nextChargeTotalCents === null) return { amount: "", chargeDate: "" };
  return { amount: formatCents(nextChargeTotalCents), chargeDate: formatDate(nextChargeAt) };
}

function frequencyPatch(subscription: Subscription, days: number): SubscriptionPatch {
  const { nextChargeAt, intervalDays } = subscription;
  return { intervalDays: days, nextChargeAt: nextChargeAt && addDays(nextChargeAt, days - intervalDays) };
}

function tooMuchOffers(subscription: Subscription): Offer[] {
  const { nextChargeAt, nextChargeTotalCents, intervalDays } = subscription;
  if (!nextChargeAt || nextChargeTotalCents === null) return [];
  const amount = formatCents(nextChargeTotalCents);
  return [
    {
      id: "skip",
      kind: "skip",
      label: t("tooMuchProductOffer.skip", {
        currentChargeDate: formatDate(nextChargeAt),
        amount,
        nextChargeDate: formatDate(addDays(nextChargeAt, intervalDays)),
      }),
    },
    ...LONGER_INTERVALS.filter((days) => days > intervalDays).map((days): Offer => {
      const patch = frequencyPatch(subscription, days);
      return {
        id: `every-${days}`,
        kind: "change",
        patch,
        label: t("tooMuchProductOffer.frequency", {
          days,
          amount,
          nextChargeDate: formatDate(patch.nextChargeAt ?? nextChargeAt),
        }),
      };
    }),
  ];
}

function costOffers(subscription: Subscription): Offer[] {
  const { nextChargeAt, nextChargeTotalCents, intervalDays, items } = subscription;
  if (!nextChargeAt || nextChargeTotalCents === null) return [];
  const monthlyCents = (days: number) => Math.round((nextChargeTotalCents * DAYS_IN_MONTH) / days);

  const quantityOffers = items
    .filter((item) => item.quantity > 1)
    .map((item): Offer => {
      const patch = withItems(
        subscription,
        items.map((other) => (other.sku === item.sku ? { ...other, quantity: other.quantity - 1 } : other)),
      );
      return {
        id: `reduce-${item.sku}`,
        kind: "change",
        patch,
        label: t("tooExpensiveOffer.reduceQuantity", {
          product: shortName(item.name),
          currentQuantity: item.quantity,
          newQuantity: item.quantity - 1,
          ...nextChargeValues({ ...subscription, ...patch }),
        }),
      };
    });

  const frequencyOffers = LONGER_INTERVALS.filter((days) => days > intervalDays).map((days): Offer => {
    const patch = frequencyPatch(subscription, days);
    return {
      id: `every-${days}`,
      kind: "change",
      patch,
      label: t("tooExpensiveOffer.frequency", {
        days,
        monthlyAmount: formatCents(monthlyCents(days)),
        currentMonthlyAmount: formatCents(monthlyCents(intervalDays)),
        nextChargeDate: formatDate(patch.nextChargeAt ?? nextChargeAt),
      }),
    };
  });

  return [...quantityOffers, ...frequencyOffers];
}

/** Products that can replace an item without duplicating anything else in the subscription. */
function swapCandidates({ items }: Subscription, replaced: SubscriptionItem): CatalogProduct[] {
  const kept = items.filter((item) => item.sku !== replaced.sku).flatMap((item) => contentsOf(item.sku));
  return catalog.filter(
    (product) => product.sku !== replaced.sku && !contentsOf(product.sku).some((sku) => kept.includes(sku)),
  );
}

export const swappableItems = (subscription: Subscription) =>
  subscription.items.filter((item) => swapCandidates(subscription, item).length > 0);

export function swapOffers(subscription: Subscription, replaced: SubscriptionItem): Offer[] {
  return swapCandidates(subscription, replaced).map((product) => {
    const patch = withItems(
      subscription,
      subscription.items.map((item) => (item.sku === replaced.sku ? { ...product, quantity: item.quantity } : item)),
    );
    return {
      id: `swap-${product.sku}`,
      kind: "change",
      patch,
      label: t("swapOffer.replace", {
        product: shortName(replaced.name),
        replacement: shortName(product.name),
        ...nextChargeValues({ ...subscription, ...patch }),
      }),
    };
  });
}

/** Whether a reason has anything to offer; if not, the flow goes straight to the final confirmation. */
export function hasOffers(reason: CancelReason, subscription: Subscription) {
  if (reason === "too-much") return tooMuchOffers(subscription).length > 0;
  if (reason === "cost") return costOffers(subscription).length > 0;
  if (reason === "different") return swappableItems(subscription).length > 0;
  return false;
}

export function offersFor(reason: CancelReason, subscription: Subscription): Offer[] {
  if (reason === "too-much") return tooMuchOffers(subscription);
  if (reason === "cost") return costOffers(subscription);
  return [];
}
