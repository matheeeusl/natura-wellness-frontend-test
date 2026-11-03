import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSubscription, skipNextShipment } from "../api/mockApi";
import { ApiError, type Subscription } from "../api/types";
import { t, type CopyKey } from "./copy/t";
import { SubscriptionCard } from "./SubscriptionCard";

vi.mock("../api/mockApi", () => ({
  getSubscription: vi.fn(),
  skipNextShipment: vi.fn(),
}));

// withTimeout.test.ts covers the real 15 seconds.
vi.mock("./withTimeout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./withTimeout")>();
  return { ...actual, withTimeout: <T,>(request: Promise<T>) => actual.withTimeout(request, 300) };
});

const LOADED_AT = "2026-10-01T12:00:00.000Z";
const REFETCHED_AT = "2026-11-01T12:00:00.000Z";

const active: Subscription = {
  id: "sub_8F2K41",
  status: "active",
  items: [
    { sku: "NW-VITD-60", name: "Vitamin D, 60 softgels", quantity: 1, unitPriceCents: 2995, imageUrl: null },
    { sku: "NW-MULTI-30", name: "Multivitamin, 30 tablets", quantity: 2, unitPriceCents: 4495, imageUrl: null },
  ],
  discountPercent: 15,
  intervalDays: 30,
  nextChargeAt: "2026-11-08T12:00:00.000Z",
  nextChargeTotalCents: 10187,
  pausedUntil: null,
  cancelledAt: null,
  updatedAt: LOADED_AT,
};

const paused: Subscription = {
  ...active,
  status: "paused",
  nextChargeAt: null,
  nextChargeTotalCents: null,
  pausedUntil: "2026-11-26T12:00:00.000Z",
};

const cancelled: Subscription = {
  ...active,
  status: "cancelled",
  nextChargeAt: null,
  nextChargeTotalCents: null,
  cancelledAt: "2026-10-23T12:00:00.000Z",
};

const skipped: Subscription = { ...active, nextChargeAt: "2026-12-08T12:00:00.000Z", updatedAt: REFETCHED_AT };

const conflict = () => new ApiError(409, "Subscription was modified since it was loaded");
const serverError = () => new ApiError(500, "Internal server error");

type CancelReasonKey = Extract<CopyKey, `cancelReason.${"tooMuchProduct" | "tooExpensive" | "differentProduct" | "noResults" | "other"}`>;

const getSubscriptionMock = vi.mocked(getSubscription);
const skipMock = vi.mocked(skipNextShipment);

async function renderCard(subscription: Subscription) {
  getSubscriptionMock.mockResolvedValue(subscription);
  const user = userEvent.setup();
  render(<SubscriptionCard />);
  await screen.findAllByRole("button");
  return user;
}

const dialog = () => screen.getByRole("dialog");
const pageButton = (name: string) => screen.getByRole("button", { name });
const dialogButton = (name: string) => within(dialog()).getByRole("button", { name });
const dialogStatus = () => within(dialog()).getByRole("status");
// Outcome messages take focus when they appear, which is how screen readers announce them.
const focusedElement = () => document.activeElement;

function expectOffers(names: string[]) {
  expect(within(dialog()).getAllByRole("radio")).toHaveLength(names.length);
  for (const name of names) expect(within(dialog()).getByRole("radio", { name })).toBeInTheDocument();
}

const waitForDialogToClose = () => waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

async function openSkipDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(pageButton(t("actions.skip")));
}

async function submitSkip(user: ReturnType<typeof userEvent.setup>) {
  await user.click(dialogButton(t("skipConfirm.confirm")));
}

async function chooseCancelReason(user: ReturnType<typeof userEvent.setup>, reason: CancelReasonKey) {
  await user.click(pageButton(t("actions.cancel")));
  await user.click(dialogButton(t(reason)));
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("skipping a shipment", () => {
  it("skips once with the loaded details, then shows the new charge", async () => {
    const user = await renderCard(active);
    skipMock.mockResolvedValue(skipped);

    await openSkipDialog(user);
    await submitSkip(user);
    await waitForDialogToClose();

    expect(skipMock).toHaveBeenCalledTimes(1);
    expect(skipMock).toHaveBeenCalledWith({ subscriptionId: "sub_8F2K41", expectedUpdatedAt: LOADED_AT });

    expect(focusedElement()).toHaveTextContent("$101.87 on December 8");
    expect(screen.getByRole("region", { name: t("nextCharge.heading") })).toHaveTextContent("December 8");
  });

  it("sends nothing when the customer keeps the shipment", async () => {
    const user = await renderCard(active);

    await openSkipDialog(user);
    await user.click(dialogButton(t("skipConfirm.keep")));
    await waitForDialogToClose();

    expect(skipMock).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: t("nextCharge.heading") })).toHaveTextContent("November 8");
  });

  it("refetches after a 409 and asks again with the latest details", async () => {
    const user = await renderCard(active);
    skipMock.mockRejectedValueOnce(conflict());
    getSubscriptionMock.mockResolvedValue({ ...active, nextChargeAt: "2026-11-10T12:00:00.000Z", updatedAt: REFETCHED_AT });

    await openSkipDialog(user);
    await submitSkip(user);

    await waitFor(() => expect(getSubscriptionMock).toHaveBeenCalledTimes(2));
    await within(dialog()).findByRole("button", { name: t("skipConfirm.confirm") });
    expect(dialogStatus()).toHaveTextContent(
      t("skipConflict.body", { currentChargeDate: "November 10", amount: "$101.87", nextChargeDate: "December 10" }),
    );
    expect(skipMock).toHaveBeenCalledTimes(1);
  });

  it("retries with the refetched updatedAt, not the stale one", async () => {
    const user = await renderCard(active);
    skipMock.mockRejectedValueOnce(conflict()).mockResolvedValueOnce(skipped);
    getSubscriptionMock.mockResolvedValue({ ...active, updatedAt: REFETCHED_AT });

    await openSkipDialog(user);
    await submitSkip(user);
    await within(dialog()).findByRole("button", { name: t("skipConfirm.confirm") });
    await submitSkip(user);
    await waitForDialogToClose();

    expect(skipMock).toHaveBeenCalledTimes(2);
    expect(skipMock).toHaveBeenLastCalledWith({ subscriptionId: "sub_8F2K41", expectedUpdatedAt: REFETCHED_AT });
    expect(focusedElement()).toHaveTextContent("December 8");
  });

  it("shows the dead-end message with real values after a second 409", async () => {
    const user = await renderCard(active);
    skipMock.mockRejectedValue(conflict());

    await openSkipDialog(user);
    await submitSkip(user);
    await within(dialog()).findByRole("button", { name: t("skipConfirm.confirm") });
    await submitSkip(user);
    await within(dialog()).findByRole("button", { name: t("skipFailure.retry") });

    const message = dialogStatus();
    expect(message).toHaveTextContent(
      t("skipFailure.repeated", { currentChargeDate: "November 8", amount: "$101.87", subscriptionId: "sub_8F2K41" }),
    );
    expect(message).toHaveTextContent("Your November 8 delivery");
    expect(message).toHaveTextContent("charged $101.87 that day");
    expect(message).toHaveTextContent("subscription ID, sub_8F2K41");
    expect(dialogButton(t("skipFailure.retry"))).toBeEnabled();
  });

  it("reaches the same dead end after two failures of another kind", async () => {
    const user = await renderCard(active);
    skipMock.mockRejectedValue(serverError());

    await openSkipDialog(user);
    await submitSkip(user);
    await within(dialog()).findByRole("button", { name: t("skipFailure.retry") });
    expect(dialogStatus()).toHaveTextContent(t("skipFailure.body", { amount: "$101.87", currentChargeDate: "November 8" }));

    await user.click(dialogButton(t("skipFailure.retry")));
    await waitFor(() => expect(skipMock).toHaveBeenCalledTimes(2));
    await within(dialog()).findByRole("button", { name: t("skipFailure.retry") });

    const message = dialogStatus();
    expect(message).toHaveTextContent("Your November 8 delivery");
    expect(message).toHaveTextContent("charged $101.87 that day");
    expect(message).toHaveTextContent("subscription ID, sub_8F2K41");
  });

  it("sends one request when the confirm button is double tapped", async () => {
    const user = await renderCard(active);
    let finishSkip = (_: Subscription) => {};
    skipMock.mockReturnValue(new Promise((resolve) => (finishSkip = resolve)));

    await openSkipDialog(user);
    await user.dblClick(dialogButton(t("skipConfirm.confirm")));

    expect(skipMock).toHaveBeenCalledTimes(1);

    finishSkip(skipped);
    await waitForDialogToClose();
    expect(skipMock).toHaveBeenCalledTimes(1);
  });
});

describe("cancel flow", () => {
  it("offers a skip or a longer interval for too much product", async () => {
    const user = await renderCard(active);

    await chooseCancelReason(user, "cancelReason.tooMuchProduct");

    expect(within(dialog()).getByRole("heading", { name: t("tooMuchProductOffer.title") })).toBeVisible();
    expectOffers([
      t("tooMuchProductOffer.skip", { currentChargeDate: "November 8", amount: "$101.87", nextChargeDate: "December 8" }),
      t("tooMuchProductOffer.frequency", { days: 45, amount: "$101.87", nextChargeDate: "November 23" }),
      t("tooMuchProductOffer.frequency", { days: 60, amount: "$101.87", nextChargeDate: "December 8" }),
      t("tooMuchProductOffer.frequency", { days: 90, amount: "$101.87", nextChargeDate: "January 7" }),
    ]);
  });

  it("offers a lower quantity or a lower monthly cost when it costs too much", async () => {
    const user = await renderCard(active);

    await chooseCancelReason(user, "cancelReason.tooExpensive");

    expect(within(dialog()).getByRole("heading", { name: t("tooExpensiveOffer.title") })).toBeVisible();
    expectOffers([
      t("tooExpensiveOffer.reduceQuantity", { product: "Multivitamin", currentQuantity: 2, newQuantity: 1, amount: "$63.67", chargeDate: "November 8" }),
      t("tooExpensiveOffer.frequency", { days: 45, monthlyAmount: "$67.91", currentMonthlyAmount: "$101.87", nextChargeDate: "November 23" }),
      t("tooExpensiveOffer.frequency", { days: 60, monthlyAmount: "$50.94", currentMonthlyAmount: "$101.87", nextChargeDate: "December 8" }),
      t("tooExpensiveOffer.frequency", { days: 90, monthlyAmount: "$33.96", currentMonthlyAmount: "$101.87", nextChargeDate: "January 7" }),
    ]);
  });

  it("lets the customer choose which item to swap for a different product", async () => {
    const user = await renderCard(active);

    await chooseCancelReason(user, "cancelReason.differentProduct");

    expect(within(dialog()).getByRole("heading", { name: t("swapOffer.title") })).toBeVisible();
    const replaceVitaminD = t("swapOffer.replace", { product: "Vitamin D", replacement: "Magnesium", amount: "$97.62", chargeDate: "November 8" });
    const replaceMultivitamin = t("swapOffer.replace", { product: "Multivitamin", replacement: "Magnesium", amount: "$67.87", chargeDate: "November 8" });
    expect(within(dialog()).getByRole("radio", { name: replaceVitaminD })).toBeInTheDocument();
    expect(within(dialog()).queryByRole("radio", { name: replaceMultivitamin })).not.toBeInTheDocument();

    await user.click(within(dialog()).getByRole("radio", { name: "Multivitamin" }));

    expect(within(dialog()).getByRole("radio", { name: replaceMultivitamin })).toBeInTheDocument();
    expect(within(dialog()).queryByRole("radio", { name: replaceVitaminD })).not.toBeInTheDocument();
  });

  it.each([
    ["Other reason", "cancelReason.other"],
    ["I didn't see results", "cancelReason.noResults"],
  ] as const)('goes straight to confirmation for "%s"', async (_, reason) => {
    const user = await renderCard(active);

    await chooseCancelReason(user, reason);

    expect(within(dialog()).getByRole("heading", { name: t("cancelConfirm.title") })).toBeVisible();
    expect(within(dialog()).queryByRole("radio")).not.toBeInTheDocument();
    expect(dialog()).toHaveTextContent("Your November 8 shipment");
  });

  it("only offers intervals longer than the current one", async () => {
    const user = await renderCard({ ...active, intervalDays: 45 });

    await chooseCancelReason(user, "cancelReason.tooMuchProduct");

    expectOffers([
      t("tooMuchProductOffer.skip", { currentChargeDate: "November 8", amount: "$101.87", nextChargeDate: "December 23" }),
      t("tooMuchProductOffer.frequency", { days: 60, amount: "$101.87", nextChargeDate: "November 23" }),
      t("tooMuchProductOffer.frequency", { days: 90, amount: "$101.87", nextChargeDate: "December 23" }),
    ]);
  });

  it("calculates offers from the date without any frequency change after the plan was shortened", async () => {
    const user = await renderCard({ ...active, intervalDays: 60 });
    await user.click(pageButton(t("actions.changePlan")));
    await user.click(within(dialog()).getByRole("radio", { name: /^Every 30 days/ }));
    await user.click(dialogButton(t("planEditor.save")));
    await waitForDialogToClose();

    await chooseCancelReason(user, "cancelReason.tooMuchProduct");

    expectOffers([
      t("tooMuchProductOffer.skip", { currentChargeDate: "November 8", amount: "$101.87", nextChargeDate: "December 8" }),
      t("tooMuchProductOffer.frequency", { days: 45, amount: "$101.87", nextChargeDate: "November 8" }),
      t("tooMuchProductOffer.frequency", { days: 60, amount: "$101.87", nextChargeDate: "November 8" }),
      t("tooMuchProductOffer.frequency", { days: 90, amount: "$101.87", nextChargeDate: "December 8" }),
    ]);
  });

  it("applies a 45-day offer in one tap, without opening the plan editor", async () => {
    const user = await renderCard(active);
    await chooseCancelReason(user, "cancelReason.tooExpensive");

    await user.click(within(dialog()).getByRole("radio", { name: /Ship every 45 days/ }));
    await user.click(dialogButton(t("cancelOffer.apply")));
    await waitForDialogToClose();

    expect(focusedElement()).toHaveTextContent(t("cancelOutcome.offerApplied", { amount: "$101.87", chargeDate: "November 23" }));
    expect(screen.getByRole("region", { name: t("nextCharge.heading") })).toHaveTextContent("Ships every 45 days");
  });

  it("finishes in 3 taps", async () => {
    const user = await renderCard(active);

    await user.click(pageButton(t("actions.cancel")));
    await user.click(dialogButton(t("cancelOffer.continueToCancel")));
    expect(dialog()).toHaveTextContent("Your November 8 shipment");
    await user.click(dialogButton(t("cancelConfirm.confirm")));
    await waitForDialogToClose();

    expect(focusedElement()).toHaveTextContent(t("cancelOutcome.cancelled"));
    expect(screen.getByRole("heading", { name: t("cancelledBanner.title") })).toBeVisible();
    expect(skipMock).not.toHaveBeenCalled();
  });

  it("keeps a way to continue cancelling on every step before the final confirmation", async () => {
    const user = await renderCard(active);

    await user.click(pageButton(t("actions.cancel")));
    expect(dialogButton(t("cancelOffer.continueToCancel"))).toBeVisible();

    await user.click(dialogButton(t("cancelReason.tooMuchProduct")));
    expect(dialogButton(t("cancelOffer.continueToCancel"))).toBeVisible();

    await user.click(within(dialog()).getAllByRole("radio")[0]);
    await user.click(dialogButton(t("cancelOffer.apply")));
    expect(within(dialog()).getByRole("heading", { name: t("skipConfirm.title") })).toBeVisible();
    expect(dialogButton(t("cancelOffer.continueToCancel"))).toBeVisible();
  });

  it.each([
    ["too much product", "cancelReason.tooMuchProduct"],
    ["costs too much", "cancelReason.tooExpensive"],
    ["different product", "cancelReason.differentProduct"],
  ] as const)('keeps a way to continue cancelling on the "%s" offer', async (_, reason) => {
    const user = await renderCard(active);

    await chooseCancelReason(user, reason);

    expect(dialogButton(t("cancelOffer.continueToCancel"))).toBeVisible();
  });
});

describe("local changes and server updates", () => {
  const nextCharge = () => screen.getByRole("region", { name: t("nextCharge.heading") });
  const frequencyNotKept = t("changeNotKept.frequency", { days: 60 });
  const productsNotKept = t("changeNotKept.products");

  async function chooseCostOffer(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
    await chooseCancelReason(user, "cancelReason.tooExpensive");
    await user.click(within(dialog()).getByRole("radio", { name }));
    await user.click(dialogButton(t("cancelOffer.apply")));
    await waitForDialogToClose();
  }

  async function hitConflictWith(user: ReturnType<typeof userEvent.setup>, fresh: Subscription) {
    skipMock.mockRejectedValueOnce(conflict());
    getSubscriptionMock.mockResolvedValue(fresh);
    await openSkipDialog(user);
    await submitSkip(user);
  }

  it("keeps local changes after a 409 when only updatedAt changed", async () => {
    const user = await renderCard(active);
    await chooseCostOffer(user, /Reduce Multivitamin/);
    await chooseCostOffer(user, /Ship every 60 days/);

    await hitConflictWith(user, { ...active, updatedAt: REFETCHED_AT });
    await within(dialog()).findByRole("button", { name: t("skipConfirm.confirm") });

    expect(dialogStatus()).toHaveTextContent("We didn't skip anything");
    expect(dialogStatus()).toHaveTextContent("$63.67 on February 6");
    expect(dialogStatus()).not.toHaveTextContent("wasn't kept");
    expect(dialogStatus()).not.toHaveTextContent("weren't kept");
    expect(nextCharge()).toHaveTextContent("$63.67");
    expect(nextCharge()).toHaveTextContent("Ships every 60 days");

    skipMock.mockResolvedValueOnce({ ...skipped, updatedAt: "2026-11-02T12:00:00.000Z" });
    await submitSkip(user);
    await waitForDialogToClose();

    expect(skipMock).toHaveBeenLastCalledWith({ subscriptionId: "sub_8F2K41", expectedUpdatedAt: REFETCHED_AT });
    expect(nextCharge()).toHaveTextContent("$63.67");
    expect(nextCharge()).toHaveTextContent("Ships every 60 days");
  });

  it("drops only the frequency change when the server's date changed, and names it", async () => {
    const user = await renderCard(active);
    await chooseCostOffer(user, /Reduce Multivitamin/);
    await chooseCostOffer(user, /Ship every 60 days/);
    expect(nextCharge()).toHaveTextContent("December 8");

    await hitConflictWith(user, { ...active, nextChargeAt: "2026-11-10T12:00:00.000Z", updatedAt: REFETCHED_AT });
    await within(dialog()).findByRole("button", { name: t("skipConfirm.confirm") });

    expect(dialogStatus()).toHaveTextContent(frequencyNotKept);
    expect(dialogStatus()).not.toHaveTextContent(productsNotKept);
    expect(nextCharge()).toHaveTextContent("November 10");
    expect(nextCharge()).toHaveTextContent("Ships every 30 days");
    expect(nextCharge()).toHaveTextContent("$63.67");
  });

  it("drops only the product change when the server's items changed, and names it", async () => {
    const user = await renderCard(active);
    await chooseCostOffer(user, /Reduce Multivitamin/);
    await chooseCostOffer(user, /Ship every 60 days/);

    const oneVitaminD = { ...active, items: [active.items[0]], nextChargeTotalCents: 2546, updatedAt: REFETCHED_AT };
    await hitConflictWith(user, oneVitaminD);
    await within(dialog()).findByRole("button", { name: t("skipConfirm.confirm") });

    expect(dialogStatus()).toHaveTextContent(productsNotKept);
    expect(dialogStatus()).not.toHaveTextContent(frequencyNotKept);
    expect(nextCharge()).toHaveTextContent("$25.46");
    expect(nextCharge()).toHaveTextContent("Ships every 60 days");
    expect(nextCharge()).toHaveTextContent("December 8");
  });

  it("drops a change when a server value it depends on changed, even if the customer's own field didn't", async () => {
    const user = await renderCard(active);
    await chooseCostOffer(user, /Reduce Multivitamin/);

    await hitConflictWith(user, { ...active, nextChargeTotalCents: 9000, updatedAt: REFETCHED_AT });
    await within(dialog()).findByRole("button", { name: t("skipConfirm.confirm") });

    expect(dialogStatus()).toHaveTextContent(productsNotKept);
    expect(nextCharge()).toHaveTextContent("$90.00");
  });

  it("names every change it drops when the server's status changed", async () => {
    const user = await renderCard(active);
    await chooseCostOffer(user, /Reduce Multivitamin/);
    await chooseCostOffer(user, /Ship every 60 days/);

    await hitConflictWith(user, { ...paused, updatedAt: REFETCHED_AT });

    await waitFor(() => expect(dialogStatus()).toHaveTextContent(t("skipFailure.noLongerActive")));
    expect(dialogStatus()).toHaveTextContent(productsNotKept);
    expect(dialogStatus()).toHaveTextContent(frequencyNotKept);
    expect(screen.getByRole("heading", { name: t("pausedBanner.title") })).toBeInTheDocument();
  });

  it("clears the message when the customer tries again", async () => {
    const user = await renderCard(active);
    await chooseCostOffer(user, /Reduce Multivitamin/);
    await hitConflictWith(user, { ...active, nextChargeTotalCents: 9000, updatedAt: REFETCHED_AT });
    await within(dialog()).findByRole("button", { name: t("skipConfirm.confirm") });
    expect(dialogStatus()).toHaveTextContent(productsNotKept);

    skipMock.mockRejectedValueOnce(serverError());
    await submitSkip(user);
    await within(dialog()).findByRole("button", { name: t("skipFailure.retry") });

    expect(dialogStatus()).not.toHaveTextContent(productsNotKept);
  });

  it("keeps local changes through the customer's own skip, even though server values move", async () => {
    const user = await renderCard(active);
    await chooseCostOffer(user, /Reduce Multivitamin/);
    await chooseCostOffer(user, /Ship every 60 days/);

    skipMock.mockResolvedValueOnce(skipped);
    await openSkipDialog(user);
    await submitSkip(user);
    await waitForDialogToClose();
    expect(nextCharge()).toHaveTextContent("$63.67");
    expect(nextCharge()).toHaveTextContent("February 6");

    await hitConflictWith(user, { ...skipped, updatedAt: "2026-11-03T12:00:00.000Z" });
    await within(dialog()).findByRole("button", { name: t("skipConfirm.confirm") });

    expect(dialogStatus()).not.toHaveTextContent("kept");
    expect(nextCharge()).toHaveTextContent("Ships every 60 days");
    expect(nextCharge()).toHaveTextContent("February 6");
  });

  it("keeps a product change when a timed-out skip turns out to have landed", async () => {
    const user = await renderCard(active);
    await chooseCostOffer(user, /Reduce Multivitamin/);
    skipMock.mockReturnValue(new Promise(() => {}));

    await openSkipDialog(user);
    await submitSkip(user);
    getSubscriptionMock.mockResolvedValue(skipped);
    await user.click(await within(dialog()).findByRole("button", { name: t("skipFailure.refreshDetails") }));
    await waitForDialogToClose();

    expect(focusedElement()).toHaveTextContent("$63.67 on December 8");
    expect(nextCharge()).toHaveTextContent("$63.67");
  });

  it("names a repeated kind of change once, because the newer one replaces the older", async () => {
    const user = await renderCard(active);
    await chooseCostOffer(user, /Reduce Multivitamin/);
    await chooseCancelReason(user, "cancelReason.differentProduct");
    await user.click(within(dialog()).getByRole("radio", { name: /Replace Vitamin D/ }));
    await user.click(dialogButton(t("cancelOffer.apply")));
    await waitForDialogToClose();

    await hitConflictWith(user, { ...active, items: [active.items[0]], updatedAt: REFETCHED_AT });
    await within(dialog()).findByRole("button", { name: t("skipConfirm.confirm") });

    expect(dialogStatus().textContent?.split(productsNotKept)).toHaveLength(2);
  });

  it("doesn't mention lost changes when there were none", async () => {
    const user = await renderCard(active);

    await hitConflictWith(user, { ...active, nextChargeAt: "2026-11-10T12:00:00.000Z", updatedAt: REFETCHED_AT });
    await within(dialog()).findByRole("button", { name: t("skipConfirm.confirm") });

    expect(dialogStatus()).not.toHaveTextContent("kept");
    expect(nextCharge()).toHaveTextContent("November 10");
  });
});

describe("loading", () => {
  const retry = () => screen.getByRole("button", { name: t("loadError.retry") });

  it("adds the care line after a second failed load, and keeps Try again", async () => {
    getSubscriptionMock.mockRejectedValue(serverError());
    const user = userEvent.setup();
    render(<SubscriptionCard />);

    expect(await screen.findByRole("alert")).toHaveTextContent(t("loadError.message"));
    expect(screen.getByRole("alert")).not.toHaveTextContent("customer care");

    await user.click(retry());
    await waitFor(() => expect(getSubscriptionMock).toHaveBeenCalledTimes(2));

    expect(await screen.findByRole("alert")).toHaveTextContent(t("loadError.repeated"));
    expect(screen.getByRole("alert")).toHaveTextContent("contact customer care");
    expect(retry()).toBeEnabled();
  });

  it("counts a timeout as a failed load", async () => {
    getSubscriptionMock.mockRejectedValueOnce(serverError()).mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    render(<SubscriptionCard />);

    await screen.findByRole("alert");
    await user.click(retry());
    await waitFor(() => expect(getSubscriptionMock).toHaveBeenCalledTimes(2));

    expect(await screen.findByRole("alert")).toHaveTextContent(t("loadError.repeated"));
  });

  it("recovers when a retry succeeds", async () => {
    getSubscriptionMock.mockRejectedValueOnce(serverError()).mockRejectedValueOnce(serverError()).mockResolvedValue(active);
    const user = userEvent.setup();
    render(<SubscriptionCard />);

    await screen.findByRole("alert");
    await user.click(retry());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(t("loadError.repeated")));
    await user.click(retry());

    expect(await screen.findByRole("region", { name: t("nextCharge.heading") })).toHaveTextContent("$101.87");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers no retry when the subscription doesn't exist", async () => {
    getSubscriptionMock.mockRejectedValue(new ApiError(404, "Subscription not found"));
    render(<SubscriptionCard />);

    expect(await screen.findByRole("alert")).toHaveTextContent(t("loadError.notFound"));
    expect(screen.queryByRole("button", { name: t("loadError.retry") })).not.toBeInTheDocument();
  });
});

describe("requests that never return", () => {
  const never = <T,>() => new Promise<T>(() => {});
  const closeButtons = () => within(dialog()).getAllByRole("button", { name: t("dialog.close") });

  it("lets the customer out of the dialog and says it couldn't confirm", async () => {
    const user = await renderCard(active);
    skipMock.mockReturnValue(never());

    await openSkipDialog(user);
    await submitSkip(user);
    await within(dialog()).findByRole("button", { name: t("skipFailure.refreshDetails") });

    expect(dialogStatus()).toHaveTextContent(t("skipFailure.unconfirmed"));
    expect(closeButtons()[0]).toBeEnabled();
    await user.click(dialogButton(t("skipConfirm.keep")));
    await waitForDialogToClose();
  });

  it("adds the care line when a second attempt also times out", async () => {
    const user = await renderCard(active);
    skipMock.mockReturnValue(never());

    await openSkipDialog(user);
    await submitSkip(user);
    await user.click(await within(dialog()).findByRole("button", { name: t("skipFailure.refreshDetails") }));
    await user.click(await within(dialog()).findByRole("button", { name: t("skipFailure.retry") }));
    await within(dialog()).findByRole("button", { name: t("skipFailure.refreshDetails") });

    expect(dialogStatus()).toHaveTextContent(t("skipFailure.unconfirmedRepeated", { subscriptionId: "sub_8F2K41" }));
    expect(dialogStatus()).toHaveTextContent("subscription ID, sub_8F2K41");
  });

  it("does not say the charge is unchanged when the refetch shows the skip landed", async () => {
    const user = await renderCard(active);
    skipMock.mockReturnValue(never());

    await openSkipDialog(user);
    await submitSkip(user);
    getSubscriptionMock.mockResolvedValue(skipped);
    await user.click(await within(dialog()).findByRole("button", { name: t("skipFailure.refreshDetails") }));
    await waitForDialogToClose();

    expect(focusedElement()).toHaveTextContent("$101.87 on December 8");
  });

  it("reports a skip that lands late while the dialog is still open", async () => {
    const user = await renderCard(active);
    let landSkip = (_: Subscription) => {};
    skipMock.mockReturnValue(new Promise((resolve) => (landSkip = resolve)));

    await openSkipDialog(user);
    await submitSkip(user);
    await within(dialog()).findByRole("button", { name: t("skipFailure.refreshDetails") });
    landSkip(skipped);
    await waitForDialogToClose();

    expect(focusedElement()).toHaveTextContent("$101.87 on December 8");
  });

  it("reports a skip that lands after the customer closed the dialog", async () => {
    const user = await renderCard(active);
    let landSkip = (_: Subscription) => {};
    skipMock.mockReturnValue(new Promise((resolve) => (landSkip = resolve)));

    await openSkipDialog(user);
    await submitSkip(user);
    await within(dialog()).findByRole("button", { name: t("skipFailure.refreshDetails") });
    await user.click(dialogButton(t("skipConfirm.keep")));
    await waitForDialogToClose();
    landSkip(skipped);

    await waitFor(() => expect(focusedElement()).toHaveTextContent("$101.87 on December 8"));
    expect(screen.getByRole("region", { name: t("nextCharge.heading") })).toHaveTextContent("December 8");
  });

  it("stays on the same message when a timed-out skip fails later", async () => {
    const user = await renderCard(active);
    let failSkip = (_: ApiError) => {};
    skipMock.mockReturnValue(new Promise((_, reject) => (failSkip = reject)));

    await openSkipDialog(user);
    await submitSkip(user);
    await within(dialog()).findByRole("button", { name: t("skipFailure.refreshDetails") });
    failSkip(serverError());
    await new Promise((resolve) => setTimeout(resolve));

    expect(dialogStatus()).toHaveTextContent(t("skipFailure.unconfirmed"));
  });

  it("reports a landed skip once, even if the late response also arrives", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const user = await renderCard(active);
    let landSkip = (_: Subscription) => {};
    skipMock.mockReturnValue(new Promise((resolve) => (landSkip = resolve)));

    await openSkipDialog(user);
    await submitSkip(user);
    getSubscriptionMock.mockResolvedValue(skipped);
    await user.click(await within(dialog()).findByRole("button", { name: t("skipFailure.refreshDetails") }));
    await waitForDialogToClose();
    landSkip(skipped);
    await new Promise((resolve) => setTimeout(resolve));

    expect(log.mock.calls.filter(([, event]) => event === "skip_completed")).toHaveLength(1);
  });

  it("does not treat a refetch that never returns as an endless wait", async () => {
    const user = await renderCard(active);
    skipMock.mockRejectedValue(conflict());
    getSubscriptionMock.mockReturnValue(never());

    await openSkipDialog(user);
    await submitSkip(user);
    await within(dialog()).findByRole("button", { name: t("skipFailure.refreshDetails") });

    expect(dialogStatus()).toHaveTextContent(t("skipFailure.unconfirmed"));
  });

  it("shows the load error when loading never returns", async () => {
    getSubscriptionMock.mockReturnValue(never());
    render(<SubscriptionCard />);

    expect(await screen.findByRole("alert")).toHaveTextContent(t("loadError.message"));
    expect(screen.getByRole("button", { name: t("loadError.retry") })).toBeEnabled();
  });
});

describe("tracking", () => {
  const trackedEvents = () => vi.mocked(console.log).mock.calls.map(([, event, payload]) => [event, payload]);
  const subscriptionId = "sub_8F2K41";

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("tracks a skip from the page", async () => {
    const user = await renderCard(active);
    skipMock.mockResolvedValue(skipped);

    await openSkipDialog(user);
    await submitSkip(user);
    await waitForDialogToClose();

    expect(trackedEvents()).toEqual([["skip_completed", { subscriptionId, source: "page" }]]);
  });

  it("does not track a skip that failed", async () => {
    const user = await renderCard(active);
    skipMock.mockRejectedValue(conflict());

    await openSkipDialog(user);
    await submitSkip(user);
    await within(dialog()).findByRole("button", { name: t("skipConfirm.confirm") });

    expect(trackedEvents()).toEqual([]);
  });

  it("tracks an accepted offer from start to finish", async () => {
    const user = await renderCard(active);

    await chooseCancelReason(user, "cancelReason.tooExpensive");
    await user.click(within(dialog()).getAllByRole("radio")[0]);
    await user.click(dialogButton(t("cancelOffer.apply")));
    await waitForDialogToClose();

    expect(trackedEvents()).toEqual([
      ["cancel_flow_opened", { subscriptionId }],
      ["cancel_reason_selected", { subscriptionId, reason: "cost" }],
      ["cancel_offer_shown", { subscriptionId, reason: "cost" }],
      ["cancel_offer_accepted", { subscriptionId, reason: "cost", offerId: "reduce-NW-MULTI-30" }],
    ]);
  });

  it("counts a skip offer as accepted only after the skip succeeds", async () => {
    const user = await renderCard(active);
    skipMock.mockResolvedValue(skipped);

    await chooseCancelReason(user, "cancelReason.tooMuchProduct");
    await user.click(within(dialog()).getAllByRole("radio")[0]);
    await user.click(dialogButton(t("cancelOffer.apply")));
    expect(trackedEvents().map(([event]) => event)).not.toContain("cancel_offer_accepted");

    await submitSkip(user);
    await waitForDialogToClose();

    expect(trackedEvents().slice(-2)).toEqual([
      ["cancel_offer_accepted", { subscriptionId, reason: "too-much", offerId: "skip" }],
      ["skip_completed", { subscriptionId, source: "cancel_flow" }],
    ]);
  });

  it("tracks a cancellation with and without a reason", async () => {
    const user = await renderCard(active);

    await chooseCancelReason(user, "cancelReason.other");
    await user.click(dialogButton(t("cancelConfirm.confirm")));
    await waitForDialogToClose();

    expect(trackedEvents()).toEqual([
      ["cancel_flow_opened", { subscriptionId }],
      ["cancel_reason_selected", { subscriptionId, reason: "other" }],
      ["cancel_completed", { subscriptionId, reason: "other" }],
    ]);
    cleanup();
    vi.mocked(console.log).mockClear();

    const second = await renderCard(active);
    await second.click(pageButton(t("actions.cancel")));
    await second.click(dialogButton(t("cancelOffer.continueToCancel")));
    await second.click(dialogButton(t("cancelConfirm.confirm")));
    await waitForDialogToClose();

    expect(trackedEvents()).toEqual([
      ["cancel_flow_opened", { subscriptionId }],
      ["cancel_completed", { subscriptionId, reason: null }],
    ]);
  });
});

describe("accessibility", () => {
  it("keeps focus on the confirm button during the request and after it fails", async () => {
    const user = await renderCard(active);
    let failSkip = (_: ApiError) => {};
    skipMock.mockReturnValue(new Promise((_, reject) => (failSkip = reject)));

    await openSkipDialog(user);
    const confirm = dialogButton(t("skipConfirm.confirm"));
    await user.click(confirm);

    expect(confirm).toHaveFocus();
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(confirm).not.toBeDisabled();

    failSkip(conflict());
    await within(dialog()).findByRole("button", { name: t("skipConfirm.confirm") });

    expect(confirm).toHaveFocus();
    expect(confirm).toHaveAttribute("aria-disabled", "false");
  });

  it("moves focus to Close when the subscription can no longer skip", async () => {
    const user = await renderCard(active);
    skipMock.mockRejectedValueOnce(conflict());
    getSubscriptionMock.mockResolvedValue(paused);

    await openSkipDialog(user);
    await submitSkip(user);

    await waitFor(() => expect(dialogStatus()).toHaveTextContent(t("skipFailure.noLongerActive")));
    // The first "Close" is the dialog's × button.
    const [, close] = within(dialog()).getAllByRole("button", { name: t("skipFailure.close") });
    await waitFor(() => expect(close).toHaveFocus());
  });

  it("moves focus to the page heading when retrying a failed load", async () => {
    getSubscriptionMock.mockRejectedValue(serverError());
    const user = userEvent.setup();
    render(<SubscriptionCard />);
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: t("loadError.retry") }));

    expect(screen.getByRole("heading", { level: 1, name: t("page.title") })).toHaveFocus();
    await screen.findByRole("alert");
  });

  it("describes each dialog with its main message", async () => {
    const user = await renderCard(active);

    await openSkipDialog(user);
    const skipBody = t("skipConfirm.body", { currentChargeDate: "November 8", amount: "$101.87", nextChargeDate: "December 8" });
    expect(dialog()).toHaveAccessibleDescription(skipBody);
    expect(within(dialog()).getByRole("heading", { name: t("skipConfirm.title") })).toHaveAccessibleDescription(skipBody);
    await user.click(dialogButton(t("skipConfirm.keep")));
    await waitForDialogToClose();

    await user.click(pageButton(t("actions.cancel")));
    expect(dialog()).toHaveAccessibleDescription(t("cancelReason.body"));
    await user.click(dialogButton(t("cancelOffer.continueToCancel")));
    expect(dialog()).toHaveAccessibleDescription("Your November 8 shipment won't be sent and you won't be charged again. You can restart later from this page.");
  });

  it("announces when the subscription has loaded", async () => {
    await renderCard(active);

    expect(screen.getByRole("status")).toHaveTextContent(t("loading.loaded"));
  });

  it("explains why an offer can't be applied yet, and ignores the press", async () => {
    const user = await renderCard(active);
    await chooseCancelReason(user, "cancelReason.tooExpensive");

    const apply = dialogButton(t("cancelOffer.apply"));
    expect(apply).toHaveAccessibleDescription(t("cancelOffer.selectHint"));
    await user.click(apply);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(within(dialog()).getAllByRole("radio")[0]);
    expect(apply).not.toHaveAccessibleDescription();
    expect(apply).toHaveAttribute("aria-disabled", "false");
  });
});

describe("paused and cancelled subscriptions", () => {
  const expectNoSkipAction = () => {
    expect(screen.queryByRole("button", { name: /skip/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /skip/i })).not.toBeInTheDocument();
  };

  it("never offers a skip on the paused page", async () => {
    await renderCard(paused);

    expect(screen.getByRole("heading", { name: t("pausedBanner.title") })).toBeVisible();
    expectNoSkipAction();
  });

  it("never offers a skip on the cancelled page", async () => {
    await renderCard(cancelled);

    expect(screen.getByRole("heading", { name: t("cancelledBanner.title") })).toBeVisible();
    expectNoSkipAction();
  });

  it("offers no skip when a paused subscription goes through the cancel flow", async () => {
    const user = await renderCard(paused);

    await user.click(pageButton(t("actions.cancel")));

    expect(within(dialog()).getByRole("heading", { name: t("cancelConfirm.title") })).toBeVisible();
    expect(within(dialog()).queryByRole("radio")).not.toBeInTheDocument();
    expectNoSkipAction();
  });

  it("removes the skip action once an active subscription is cancelled", async () => {
    const user = await renderCard(active);

    await user.click(pageButton(t("actions.cancel")));
    await user.click(dialogButton(t("cancelOffer.continueToCancel")));
    await user.click(dialogButton(t("cancelConfirm.confirm")));
    await waitForDialogToClose();

    expectNoSkipAction();
  });
});

describe("changing the plan", () => {
  const nextCharge = () => screen.getByRole("region", { name: t("nextCharge.heading") });
  const preview = (amount: string, chargeDate: string) => t("planEditor.preview", { amount, chargeDate });

  const openEditor = (user: ReturnType<typeof userEvent.setup>) => user.click(pageButton(t("actions.changePlan")));
  const chooseFrequency = (user: ReturnType<typeof userEvent.setup>, days: number) =>
    user.click(within(dialog()).getByRole("radio", { name: new RegExp(`^Every ${days} days`) }));

  async function saveFrequency(user: ReturnType<typeof userEvent.setup>, days: number) {
    await openEditor(user);
    await chooseFrequency(user, days);
    await user.click(dialogButton(t("planEditor.save")));
    await waitForDialogToClose();
  }

  it("is only offered on the active page", async () => {
    await renderCard(paused);
    expect(screen.queryByRole("button", { name: t("actions.changePlan") })).not.toBeInTheDocument();
    cleanup();

    await renderCard(cancelled);
    expect(screen.queryByRole("button", { name: t("actions.changePlan") })).not.toBeInTheDocument();
  });

  it("lists every frequency with its monthly cost, with the current one selected", async () => {
    const user = await renderCard(active);
    await openEditor(user);

    expectOffers([
      t("planEditor.frequencyOption", { days: 30, monthlyAmount: "$101.87" }),
      t("planEditor.frequencyOption", { days: 45, monthlyAmount: "$67.91" }),
      t("planEditor.frequencyOption", { days: 60, monthlyAmount: "$50.94" }),
      t("planEditor.frequencyOption", { days: 90, monthlyAmount: "$33.96" }),
    ]);
    expect(within(dialog()).getByRole("radio", { name: /^Every 30 days/ })).toBeChecked();
    expect(dialog()).toHaveAccessibleDescription(preview("$101.87", "November 8"));
  });

  it("explains why it can't save before any change, and ignores the press", async () => {
    const user = await renderCard(active);
    await openEditor(user);

    const save = dialogButton(t("planEditor.save"));
    expect(save).toHaveAccessibleDescription(t("planEditor.changeHint"));
    await user.click(save);
    expect(dialog()).toBeInTheDocument();

    await chooseFrequency(user, 60);
    expect(save).not.toHaveAccessibleDescription();
    await chooseFrequency(user, 30);
    expect(save).toHaveAccessibleDescription(t("planEditor.changeHint"));
  });

  it("moves the charge out by the difference when the interval gets longer, only after saving", async () => {
    const user = await renderCard(active);
    await openEditor(user);
    await chooseFrequency(user, 60);

    expect(dialog()).toHaveAccessibleDescription(preview("$101.87", "December 8"));
    expect(nextCharge()).toHaveTextContent("on November 8");

    await user.click(dialogButton(t("planEditor.save")));
    await waitForDialogToClose();

    expect(focusedElement()).toHaveTextContent(t("cancelOutcome.offerApplied", { amount: "$101.87", chargeDate: "December 8" }));
    expect(nextCharge()).toHaveTextContent("on December 8");
    expect(nextCharge()).toHaveTextContent("Ships every 60 days");
  });

  it("changes nothing when the customer closes without saving", async () => {
    const user = await renderCard(active);
    await openEditor(user);
    await chooseFrequency(user, 90);
    await user.click(dialogButton(t("dialog.close")));
    await waitForDialogToClose();

    expect(nextCharge()).toHaveTextContent("on November 8");
    expect(nextCharge()).toHaveTextContent("Ships every 30 days");
  });

  it("keeps the charge date when the interval gets shorter", async () => {
    const user = await renderCard({ ...active, intervalDays: 60 });
    await openEditor(user);
    await chooseFrequency(user, 30);

    expect(dialog()).toHaveAccessibleDescription(
      t("planEditor.previewChargeStays", { amount: "$101.87", chargeDate: "November 8", days: 30 }),
    );

    await user.click(dialogButton(t("planEditor.save")));
    await waitForDialogToClose();

    expect(nextCharge()).toHaveTextContent("on November 8");
    expect(nextCharge()).toHaveTextContent("Ships every 30 days");
  });

  it("restores the original date going from 30 to 60 and back to 30", async () => {
    const user = await renderCard(active);
    await saveFrequency(user, 60);

    await openEditor(user);
    await chooseFrequency(user, 30);
    // The date moves back, so the "stays" message would be false here.
    expect(dialog()).toHaveAccessibleDescription(preview("$101.87", "November 8"));
    await user.click(dialogButton(t("planEditor.save")));
    await waitForDialogToClose();

    expect(nextCharge()).toHaveTextContent("on November 8");
    expect(nextCharge()).toHaveTextContent("Ships every 30 days");
  });

  it("calculates from the date without any frequency change, not from the date shown", async () => {
    const user = await renderCard(active);
    await saveFrequency(user, 90);
    expect(nextCharge()).toHaveTextContent("on January 7");

    await saveFrequency(user, 45);

    expect(nextCharge()).toHaveTextContent("on November 23");
  });

  it("doesn't report a lost change after the customer went back to the original frequency", async () => {
    const user = await renderCard(active);
    await saveFrequency(user, 60);
    await saveFrequency(user, 30);

    skipMock.mockRejectedValueOnce(conflict());
    getSubscriptionMock.mockResolvedValue({ ...active, nextChargeAt: "2026-11-15T12:00:00.000Z", updatedAt: REFETCHED_AT });
    await openSkipDialog(user);
    await submitSkip(user);

    await waitFor(() => expect(dialogStatus()).toHaveTextContent("November 15"));
    expect(dialogStatus()).not.toHaveTextContent(/wasn't kept/);
  });

  it("drops a saved frequency when the server's date changed, and names it", async () => {
    const user = await renderCard(active);
    await saveFrequency(user, 60);

    skipMock.mockRejectedValueOnce(conflict());
    getSubscriptionMock.mockResolvedValue({ ...active, nextChargeAt: "2026-11-15T12:00:00.000Z", updatedAt: REFETCHED_AT });
    await openSkipDialog(user);
    await submitSkip(user);

    await waitFor(() => expect(dialogStatus()).toHaveTextContent(t("changeNotKept.frequency", { days: 60 })));
  });

  it("returns to the date a 30-day skip would give when shortening after a skip at 60 days", async () => {
    const user = await renderCard(active);
    await saveFrequency(user, 60);
    skipMock.mockResolvedValue(skipped);
    await openSkipDialog(user);
    await submitSkip(user);
    await waitForDialogToClose();
    expect(nextCharge()).toHaveTextContent("on February 6");

    await openEditor(user);
    await chooseFrequency(user, 30);

    expect(dialog()).toHaveAccessibleDescription(preview("$101.87", "December 8"));
  });

  it("moves a restarted subscription's charge by the difference from the interval it restarted on", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2026-11-03T12:00:00.000Z");
    try {
      const user = await renderCard(active);
      await saveFrequency(user, 60);
      await chooseCancelReason(user, "cancelReason.other");
      await user.click(dialogButton(t("cancelConfirm.confirm")));
      await waitForDialogToClose();
      await user.click(pageButton(t("actions.restart")));
      await user.click(dialogButton(t("restartConfirm.confirm")));
      await waitForDialogToClose();
      expect(nextCharge()).toHaveTextContent("on November 6");
      expect(nextCharge()).toHaveTextContent("Ships every 60 days");

      await openEditor(user);
      await chooseFrequency(user, 90);
      expect(dialog()).toHaveAccessibleDescription(preview("$101.87", "December 6"));

      await chooseFrequency(user, 45);
      expect(dialog()).toHaveAccessibleDescription(
        t("planEditor.previewChargeStays", { amount: "$101.87", chargeDate: "November 6", days: 45 }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  describe("quantity", () => {
    const increase = (product: string) => dialogButton(t("planEditor.increaseQuantity", { product }));
    const decrease = (product: string) => dialogButton(t("planEditor.decreaseQuantity", { product }));
    const quantityGroup = (product: string) => within(dialog()).getByRole("group", { name: t("planEditor.quantityLabel", { product }) });

    it("previews the new total and only applies it after saving", async () => {
      const user = await renderCard(active);
      await openEditor(user);
      await user.click(increase("Vitamin D"));

      expect(quantityGroup("Vitamin D")).toHaveTextContent("2");
      expect(dialog()).toHaveAccessibleDescription(preview("$127.33", "November 8"));
      expect(nextCharge()).toHaveTextContent("$101.87");

      await user.click(dialogButton(t("planEditor.save")));
      await waitForDialogToClose();

      expect(focusedElement()).toHaveTextContent(t("cancelOutcome.offerApplied", { amount: "$127.33", chargeDate: "November 8" }));
      expect(nextCharge()).toHaveTextContent("$127.33");
      expect(screen.getByText(t("savings.perShipment", { amount: "$22.47" }))).toBeInTheDocument();
      expect(screen.getAllByText(t("products.quantity", { quantity: 2 }))).toHaveLength(2);
    });

    it("updates each frequency's monthly cost with the draft quantity", async () => {
      const user = await renderCard(active);
      await openEditor(user);
      await user.click(increase("Vitamin D"));

      expect(within(dialog()).getByRole("radio", { name: t("planEditor.frequencyOption", { days: 60, monthlyAmount: "$63.67" }) })).toBeInTheDocument();
    });

    it("saves a frequency and a quantity changed together", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const user = await renderCard(active);
      await openEditor(user);
      await chooseFrequency(user, 60);
      await user.click(increase("Vitamin D"));
      expect(dialog()).toHaveAccessibleDescription(preview("$127.33", "December 8"));

      await user.click(dialogButton(t("planEditor.save")));
      await waitForDialogToClose();

      expect(nextCharge()).toHaveTextContent("$127.33");
      expect(nextCharge()).toHaveTextContent("on December 8");
      expect(nextCharge()).toHaveTextContent("Ships every 60 days");
      expect(log).toHaveBeenCalledWith("[track]", "plan_updated", { subscriptionId: "sub_8F2K41", changes: ["frequency", "products"] });
    });

    it("doesn't say the charge stays when shortening also changes the amount", async () => {
      const user = await renderCard({ ...active, intervalDays: 60 });
      await openEditor(user);
      await chooseFrequency(user, 30);
      await user.click(increase("Vitamin D"));

      expect(dialog()).toHaveAccessibleDescription(preview("$127.33", "November 8"));
    });

    it("stops at 1, with no way to remove a product, and keeps focus on the button", async () => {
      const user = await renderCard(active);
      await openEditor(user);

      const button = decrease("Vitamin D");
      expect(button).toHaveAttribute("aria-disabled", "true");
      await user.click(button);

      expect(quantityGroup("Vitamin D")).toHaveTextContent("1");
      expect(focusedElement()).toBe(button);
      expect(dialogButton(t("planEditor.save"))).toHaveAttribute("aria-disabled", "true");
    });

    it("stops at 10", async () => {
      const user = await renderCard(active);
      await openEditor(user);

      const button = increase("Vitamin D");
      for (let press = 0; press < 12; press++) await user.click(button);

      expect(quantityGroup("Vitamin D")).toHaveTextContent("10");
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(focusedElement()).toBe(button);
    });

    it("has nothing to save once a quantity is back where it started", async () => {
      const user = await renderCard(active);
      await openEditor(user);
      await user.click(increase("Vitamin D"));
      await user.click(decrease("Vitamin D"));

      expect(dialogButton(t("planEditor.save"))).toHaveAttribute("aria-disabled", "true");
    });

    it("doesn't report a lost change after the customer put a saved quantity back", async () => {
      const user = await renderCard(active);
      for (const stepper of [increase, decrease]) {
        await openEditor(user);
        await user.click(stepper("Vitamin D"));
        await user.click(dialogButton(t("planEditor.save")));
        await waitForDialogToClose();
      }

      skipMock.mockRejectedValueOnce(conflict());
      getSubscriptionMock.mockResolvedValue({ ...active, items: [active.items[1]], updatedAt: REFETCHED_AT });
      await openSkipDialog(user);
      await submitSkip(user);
      await within(dialog()).findByRole("button", { name: t("skipConfirm.confirm") });

      expect(dialogStatus()).not.toHaveTextContent(/weren't kept/);
    });

    it("keeps a quantity through a 409 when only updatedAt changed, and drops it when the items changed", async () => {
      const user = await renderCard(active);
      await openEditor(user);
      await user.click(increase("Vitamin D"));
      await user.click(dialogButton(t("planEditor.save")));
      await waitForDialogToClose();

      skipMock.mockRejectedValueOnce(conflict());
      getSubscriptionMock.mockResolvedValue({ ...active, updatedAt: REFETCHED_AT });
      await openSkipDialog(user);
      await submitSkip(user);
      await within(dialog()).findByRole("button", { name: t("skipConfirm.confirm") });
      expect(nextCharge()).toHaveTextContent("$127.33");
      expect(dialogStatus()).not.toHaveTextContent(t("changeNotKept.products"));

      skipMock.mockRejectedValueOnce(conflict());
      getSubscriptionMock.mockResolvedValue({ ...active, items: [active.items[1]], nextChargeTotalCents: 7642, updatedAt: REFETCHED_AT });
      await submitSkip(user);
      await waitFor(() => expect(dialogStatus()).toHaveTextContent(t("changeNotKept.products")));
      expect(nextCharge()).toHaveTextContent("$76.42");
    });
  });

  it("tracks a saved change, and nothing for a closed editor", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const user = await renderCard(active);
    await openEditor(user);
    await chooseFrequency(user, 60);
    await user.click(dialogButton(t("dialog.close")));
    await waitForDialogToClose();
    expect(log).not.toHaveBeenCalled();

    await saveFrequency(user, 60);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[track]", "plan_updated", { subscriptionId: "sub_8F2K41", changes: ["frequency"] });
  });
});
