import type { CopyFile } from "./t";

export const cancelFlow = {
  cancelReason: {
    title: { en: "Why are you cancelling?" },
    body: { en: "Your answer helps us show options that may suit you. You can also cancel without answering." },
    tooMuchProduct: { en: "I have too much product left" },
    tooExpensive: { en: "It costs too much" },
    differentProduct: { en: "I'm trying a different product" },
    noResults: { en: "I didn't see results" },
    other: { en: "Other reason" },
  },
  tooMuchProductOffer: {
    title: { en: "You could get your next shipment later." },
    skip: { en: "Skip the {currentChargeDate} shipment: next charge {amount} on {nextChargeDate}." },
    frequency: { en: "Ship every {days} days: next charge {amount} on {nextChargeDate}." },
  },
  tooExpensiveOffer: {
    title: { en: "You could pay less." },
    reduceQuantity: { en: "Reduce {product} from {currentQuantity} to {newQuantity}: next charge {amount} on {chargeDate}." },
    frequency: { en: "Ship every {days} days: about {monthlyAmount} a month instead of {currentMonthlyAmount}, next charge {nextChargeDate}." },
  },
  swapOffer: {
    title: { en: "You could swap a product." },
    itemLegend: { en: "Which product do you want to replace?" },
    replace: { en: "Replace {product} with {replacement}: next charge {amount} on {chargeDate}." },
  },
  cancelOffer: {
    legend: { en: "Options instead of cancelling" },
    apply: { en: "Apply this option" },
    continueToCancel: { en: "Continue to cancel" },
  },
  cancelConfirm: {
    title: { en: "Cancel your subscription?" },
    body: { en: "Your {shipmentDate} shipment won't be sent and you won't be charged again. You can restart later from this page." },
    bodyWithoutShipment: { en: "You won't be charged again. You can restart later from this page." },
    confirm: { en: "Cancel subscription" },
    keep: { en: "Keep subscription" },
  },
  cancelOutcome: {
    offerApplied: { en: "Your subscription is updated. Your next charge is {amount} on {chargeDate}." },
    cancelled: { en: "Your subscription is cancelled. You won't be charged again." },
  },
} as const satisfies CopyFile;
