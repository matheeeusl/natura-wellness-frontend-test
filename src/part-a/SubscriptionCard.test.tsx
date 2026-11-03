import { render, screen, waitFor, within } from "@testing-library/react";
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
