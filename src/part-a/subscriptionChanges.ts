import { catalog, totalAfterDiscount } from "../api/fixtures";
import type { CatalogProduct, Subscription, SubscriptionItem } from "../api/types";
import { t } from "./copy/t";
import { formatCents, formatDate, shortName } from "./format";

/** Fields the mock API can't change, simulated on top of what it returns. */
export type SubscriptionPatch = Partial<
  Pick<Subscription, "status" | "items" | "intervalDays" | "nextChargeAt" | "nextChargeTotalCents" | "pausedUntil" | "cancelledAt">
>;

export interface SubscriptionChange {
  kind: "frequency" | "products" | "cancel" | "resume" | "restart";
  patch: SubscriptionPatch;
}

/** The next charge and interval as they would be with no frequency change on top. */
export type FrequencyBase = Pick<Subscription, "nextChargeAt" | "intervalDays">;

export type CancelReason = "too-much" | "cost" | "different" | "no-results" | "other";

export type Offer = { id: string; label: string } & ({ kind: "skip" } | { kind: "change"; change: SubscriptionChange });

export const SKIP_OFFER_ID = "skip";

export const FREQUENCY_OPTIONS = [30, 45, 60, 90];
export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_IN_MONTH = 30;
const REACTIVATION_DELAY_DAYS = 3;
const OFFERED_INTERVALS = [45, 60, 90];
/** The catalog only lists a bundle's contents in its name. */
const BUNDLE_CONTENTS: Record<string, string[]> = {
  "NW-ESSENTIALS": ["NW-VITD-60", "NW-MULTI-30", "NW-MAG-90"],
};

export const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY_MS).toISOString();

export const monthlyCents = (totalCents: number, days: number) => Math.round((totalCents * DAYS_IN_MONTH) / days);

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
  // The new date replaces any date a frequency change set, so it's based on the interval shown now.
  intervalDays: subscription.intervalDays,
  nextChargeAt: addDays(new Date().toISOString(), REACTIVATION_DELAY_DAYS),
  nextChargeTotalCents: totalAfterDiscount(subscription.items, subscription.discountPercent),
});

/** The next charge, formatted for copy. Empty when nothing is scheduled. */
export function nextChargeValues({ nextChargeAt, nextChargeTotalCents }: Pick<Subscription, "nextChargeAt" | "nextChargeTotalCents">) {
  if (!nextChargeAt || nextChargeTotalCents === null) return { amount: "", chargeDate: "" };
  return { amount: formatCents(nextChargeTotalCents), chargeDate: formatDate(nextChargeAt) };
}

/** A longer interval moves the charge out by the difference; a shorter one keeps it. Going back restores the original date. */
export function frequencyChange({ nextChargeAt, intervalDays }: FrequencyBase, days: number): SubscriptionChange {
  return {
    kind: "frequency",
    patch: { intervalDays: days, nextChargeAt: nextChargeAt && addDays(nextChargeAt, Math.max(days - intervalDays, 0)) },
  };
}

/** `quantities` holds new quantities by SKU; items it doesn't list stay as they are. */
export function quantityChange(subscription: Subscription, quantities: Record<string, number>): SubscriptionChange {
  return {
    kind: "products",
    patch: withItems(
      subscription,
      subscription.items.map((item) => ({ ...item, quantity: quantities[item.sku] ?? item.quantity })),
    ),
  };
}

function tooMuchOffers(subscription: Subscription, base: FrequencyBase): Offer[] {
  const { nextChargeAt, nextChargeTotalCents, intervalDays } = subscription;
  if (!nextChargeAt || nextChargeTotalCents === null) return [];
  const amount = formatCents(nextChargeTotalCents);
  return [
    {
      id: SKIP_OFFER_ID,
      kind: "skip",
      label: t("tooMuchProductOffer.skip", {
        currentChargeDate: formatDate(nextChargeAt),
        amount,
        nextChargeDate: formatDate(addDays(nextChargeAt, intervalDays)),
      }),
    },
    ...OFFERED_INTERVALS.filter((days) => days > intervalDays).map((days): Offer => {
      const change = frequencyChange(base, days);
      return {
        id: `every-${days}`,
        kind: "change",
        change,
        label: t("tooMuchProductOffer.frequency", {
          days,
          amount,
          nextChargeDate: formatDate(change.patch.nextChargeAt ?? nextChargeAt),
        }),
      };
    }),
  ];
}

function costOffers(subscription: Subscription, base: FrequencyBase): Offer[] {
  const { nextChargeAt, nextChargeTotalCents, intervalDays, items } = subscription;
  if (!nextChargeAt || nextChargeTotalCents === null) return [];

  const quantityOffers = items
    .filter((item) => item.quantity > 1)
    .map((item): Offer => {
      const change = quantityChange(subscription, { [item.sku]: item.quantity - 1 });
      return {
        id: `reduce-${item.sku}`,
        kind: "change",
        change,
        label: t("tooExpensiveOffer.reduceQuantity", {
          product: shortName(item.name),
          currentQuantity: item.quantity,
          newQuantity: item.quantity - 1,
          ...nextChargeValues({ ...subscription, ...change.patch }),
        }),
      };
    });

  const frequencyOffers = OFFERED_INTERVALS.filter((days) => days > intervalDays).map((days): Offer => {
    const change = frequencyChange(base, days);
    return {
      id: `every-${days}`,
      kind: "change",
      change,
      label: t("tooExpensiveOffer.frequency", {
        days,
        monthlyAmount: formatCents(monthlyCents(nextChargeTotalCents, days)),
        currentMonthlyAmount: formatCents(monthlyCents(nextChargeTotalCents, intervalDays)),
        nextChargeDate: formatDate(change.patch.nextChargeAt ?? nextChargeAt),
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
      change: { kind: "products", patch },
      label: t("swapOffer.replace", {
        product: shortName(replaced.name),
        replacement: shortName(product.name),
        ...nextChargeValues({ ...subscription, ...patch }),
      }),
    };
  });
}

/** Whether a reason has anything to offer; if not, the flow goes straight to the final confirmation. */
export function hasOffers(reason: CancelReason, subscription: Subscription, base: FrequencyBase) {
  if (reason === "too-much") return tooMuchOffers(subscription, base).length > 0;
  if (reason === "cost") return costOffers(subscription, base).length > 0;
  if (reason === "different") return swappableItems(subscription).length > 0;
  return false;
}

export function offersFor(reason: CancelReason, subscription: Subscription, base: FrequencyBase): Offer[] {
  if (reason === "too-much") return tooMuchOffers(subscription, base);
  if (reason === "cost") return costOffers(subscription, base);
  return [];
}
