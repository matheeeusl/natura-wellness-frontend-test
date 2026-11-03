import { copy } from "./copy";

export type PurchaseOption = "oneTime" | "subscribe";

export interface BuyBoxState {
  option: PurchaseOption;
  frequency: string;
  quantity: number;
}

export const MIN_QUANTITY = 1;
// The design doesn't set a maximum. 10 is an assumption, matching Part A's stepper.
export const MAX_QUANTITY = 10;

export const initialState: BuyBoxState = {
  option: "subscribe",
  frequency: copy.subscribe.frequencyOptions[0],
  quantity: 1,
};

const moneyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const formatCents = (cents: number) => moneyFormat.format(cents / 100);

const subscriptionFinePrint = (frequency: string, price: string) =>
  `Your subscription renews every ${frequency} at ${price} until you cancel. Skip or cancel anytime from your account.`;

/** Everything shown on the box. Card prices are per unit; the total and fine print follow quantity. */
export function deriveBuyBox({ option, frequency, quantity }: BuyBoxState) {
  const subscribed = option === "subscribe";
  const unitCents = subscribed ? copy.subscribe.priceCents : copy.oneTime.priceCents;
  const total = formatCents(unitCents * quantity);

  return {
    subscribed,
    oneTimePrice: formatCents(copy.oneTime.priceCents),
    subscribePrice: formatCents(copy.subscribe.priceCents),
    comparePrice: formatCents(copy.subscribe.comparePriceCents),
    total,
    finePrint: subscribed ? subscriptionFinePrint(frequency, total) : null,
    atMinQuantity: quantity <= MIN_QUANTITY,
    atMaxQuantity: quantity >= MAX_QUANTITY,
  };
}
