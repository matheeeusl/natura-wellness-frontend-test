import type { CopyFile } from "./t";

export const skipFlow = {
  skipConfirm: {
    title: { en: "Skip your next shipment?" },
    body: { en: "We won't ship or charge you on {currentChargeDate}. Your next charge will be {amount} on {nextChargeDate}." },
    confirm: { en: "Skip shipment" },
    keep: { en: "Keep shipment" },
  },
  skipProgress: {
    submitting: { en: "Skipping…" },
    checking: { en: "Checking…" },
    slow: { en: "This is taking longer than usual. Please keep this page open." },
    conflictRefreshing: { en: "Your subscription changed since this page loaded. Getting the latest details." },
    refreshing: { en: "Getting the latest details." },
  },
  skipConflict: {
    changesNotKept: { en: "Your recent changes to this subscription weren't kept." },
    body: { en: "We didn't skip anything because your subscription was updated elsewhere. Skip the {currentChargeDate} shipment? Your next charge would be {amount} on {nextChargeDate}." },
  },
  skipFailure: {
    body: { en: "We couldn't skip your shipment. Your next charge is still {amount} on {currentChargeDate}. Please try again." },
    retry: { en: "Try again" },
    repeated: { en: "We still couldn't skip your shipment. Your {currentChargeDate} delivery is still on, and you'll be charged {amount} that day. Try again in a few minutes. If this keeps happening, contact customer care and give them your subscription ID, {subscriptionId}." },
    noLongerActive: { en: "Your subscription was updated and can't skip a shipment right now. We didn't skip anything." },
    close: { en: "Close" },
    unconfirmed: { en: "We couldn't confirm what happened. Refresh this page to check your next charge date before trying again." },
    unconfirmedRepeated: { en: "We couldn't confirm what happened. Refresh this page to check your next charge date before trying again. If this keeps happening, contact customer care and give them your subscription ID, {subscriptionId}." },
    refreshDetails: { en: "Refresh details" },
  },
  skipSuccess: {
    message: { en: "Shipment skipped. Your next charge is {amount} on {nextChargeDate}." },
  },
} as const satisfies CopyFile;
