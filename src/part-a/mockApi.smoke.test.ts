import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Uses the real mock, unlike SubscriptionCard.test.tsx, so we notice if its behavior drifts.
// The mock reads the URL when it loads, so each scenario imports a fresh copy.
async function loadMock(query: string) {
  window.history.pushState({}, "", `/?${query}`);
  vi.resetModules();
  return import("../api/mockApi");
}

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setTimerTickMode("nextTimerAsync");
});

afterEach(() => {
  vi.useRealTimers();
});

it("keeps the behavior the subscription page relies on", async () => {
  const never = await loadMock("fixture=active&conflict=never");
  const loaded = await never.getSubscription();
  expect(loaded.status).toBe("active");
  expect(loaded.nextChargeAt).not.toBeNull();
  expect(loaded.nextChargeTotalCents).not.toBeNull();

  const expected = { subscriptionId: loaded.id, expectedUpdatedAt: loaded.updatedAt };
  const updated = await never.skipNextShipment(expected);
  expect(Date.parse(updated.nextChargeAt ?? "") - Date.parse(loaded.nextChargeAt ?? "")).toBe(loaded.intervalDays * DAY_MS);
  expect(updated.nextChargeTotalCents).toBe(loaded.nextChargeTotalCents);
  expect(updated.updatedAt).not.toBe(loaded.updatedAt);
  await expect(never.skipNextShipment(expected)).rejects.toMatchObject({ status: 409 });

  const always = await loadMock("fixture=active&conflict=always");
  for (let attempt = 0; attempt < 2; attempt++) {
    const fresh = await always.getSubscription();
      await expect(always.skipNextShipment({ subscriptionId: fresh.id, expectedUpdatedAt: fresh.updatedAt })).rejects.toMatchObject({ status: 409 });
  }

  const paused = await loadMock("fixture=paused&conflict=never");
  const pausedSubscription = await paused.getSubscription();
  expect(pausedSubscription).toMatchObject({ status: "paused", nextChargeAt: null, nextChargeTotalCents: null });
  expect(pausedSubscription.pausedUntil).not.toBeNull();
  await expect(
    paused.skipNextShipment({ subscriptionId: pausedSubscription.id, expectedUpdatedAt: pausedSubscription.updatedAt }),
  ).rejects.toMatchObject({ status: 400 });

  const cancelled = await loadMock("fixture=cancelled");
  const cancelledSubscription = await cancelled.getSubscription();
  expect(cancelledSubscription).toMatchObject({ status: "cancelled", nextChargeAt: null, nextChargeTotalCents: null });
  expect(cancelledSubscription.cancelledAt).not.toBeNull();

  const failing = await loadMock("fixture=error");
  await expect(failing.getSubscription()).rejects.toMatchObject({ status: 500 });

  const missing = await loadMock("fixture=nope");
  await expect(missing.getSubscription()).rejects.toMatchObject({ status: 404 });
});
