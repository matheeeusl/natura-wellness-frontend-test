import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom doesn't implement these browser APIs.
HTMLDialogElement.prototype.showModal = function showModal() {
  this.open = true;
};
HTMLDialogElement.prototype.close = function close() {
  this.open = false;
};

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

// Reduced motion makes dialogs close without waiting for the exit animation.
vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));

afterEach(cleanup);
