/** Dev-only: lays the reference over the 1200px frame at 50% opacity with ?overlay=1. */
export function ReferenceOverlay() {
  if (!import.meta.env.DEV || new URLSearchParams(window.location.search).get("overlay") !== "1") return null;

  return (
    <img
      src="/reference/buy-box.png"
      alt=""
      className="pointer-events-none absolute top-0 left-0 z-50 w-[1200px] max-w-none opacity-50"
    />
  );
}
