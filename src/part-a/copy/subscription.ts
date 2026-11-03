import type { CopyFile } from "./t";

export const subscription = {
  page: {
    title: { en: "Manage my subscription" },
  },
  loading: {
    message: { en: "Loading your subscription." },
    slow: { en: "Still loading your subscription. This can take a few seconds." },
  },
  loadError: {
    message: { en: "We couldn't load your subscription. Please try again." },
    retry: { en: "Try again" },
    notFound: { en: "We couldn't find this subscription. If you think this is a mistake, contact customer care." },
  },
  nextCharge: {
    heading: { en: "Next charge" },
    date: { en: "on {chargeDate}" },
    frequency: { en: "Ships every {days} days" },
  },
  pausedBanner: {
    title: { en: "Paused" },
    message: { en: "Your subscription is paused until {resumeDate}. You won't be charged while it's paused." },
    messageWithoutDate: { en: "Your subscription is paused. You won't be charged while it's paused." },
  },
  cancelledBanner: {
    title: { en: "Cancelled" },
    message: { en: "This subscription was cancelled on {cancelledDate}. You won't be charged again." },
    messageWithoutDate: { en: "This subscription was cancelled. You won't be charged again." },
  },
  products: {
    headingActive: { en: "In your next shipment" },
    headingPaused: { en: "In your subscription" },
    headingCancelled: { en: "Previously in your subscription" },
    quantity: { en: "Quantity: {quantity}" },
  },
  savings: {
    perShipment: { en: "You save {amount} on every shipment." },
  },
  actions: {
    skip: { en: "Skip next shipment" },
    resume: { en: "Resume now" },
    restart: { en: "Restart subscription" },
    cancel: { en: "Cancel subscription" },
  },
  resumeConfirm: {
    title: { en: "Resume your subscription?" },
    body: { en: "Your next charge will be {amount} on {chargeDate}." },
    confirm: { en: "Resume subscription" },
    dismiss: { en: "Not now" },
  },
  resumeSuccess: {
    message: { en: "Your subscription is active again. Your next charge is {amount} on {chargeDate}." },
  },
  restartConfirm: {
    title: { en: "Restart your subscription?" },
    body: { en: "Your first charge will be {amount} on {chargeDate}." },
    confirm: { en: "Restart subscription" },
    dismiss: { en: "Not now" },
  },
  restartSuccess: {
    message: { en: "Your subscription has restarted. Your first charge is {amount} on {chargeDate}." },
  },
  dialog: {
    close: { en: "Close" },
  },
} as const satisfies CopyFile;
