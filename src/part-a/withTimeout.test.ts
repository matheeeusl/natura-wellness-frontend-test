import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { REQUEST_TIMEOUT_MS, TimeoutError, withTimeout } from "./withTimeout";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it("gives up after 15 seconds, not before", async () => {
  expect(REQUEST_TIMEOUT_MS).toBe(15_000);
  const settled = vi.fn();
  const result = withTimeout(new Promise(() => {}));
  result.catch(settled);

  await vi.advanceTimersByTimeAsync(14_999);
  expect(settled).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(1);
  await expect(result).rejects.toBeInstanceOf(TimeoutError);
});

it("passes through a result or failure that arrives in time", async () => {
  await expect(withTimeout(Promise.resolve("done"))).resolves.toBe("done");
  await expect(withTimeout(Promise.reject(new Error("boom")))).rejects.toThrow("boom");
  expect(vi.getTimerCount()).toBe(0);
});
