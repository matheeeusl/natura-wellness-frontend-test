import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { t } from "./copy/t";

export interface DialogTransition {
  closing: boolean;
  onExited: () => void;
}

interface DialogProps {
  title: string;
  /** Blocks closing while a request is running. */
  busy?: boolean;
  transition: DialogTransition;
  onClose: () => void;
  children: ReactNode;
}

/** Matches the longest exit animation in index.css. */
const EXIT_MS = 180;

/** Bottom sheet on phones, centered modal from the `sm` breakpoint up. Mount it to open; set `closing` to animate out. */
export function Dialog({ title, busy = false, transition, onClose, children }: DialogProps) {
  const { closing, onExited } = transition;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  const titleId = useId();
  const [contentHeight, setContentHeight] = useState<number>();

  // Data can update as the dialog closes, so keep showing what the customer just acted on.
  const lastOpen = useRef({ title, children });
  useLayoutEffect(() => {
    if (!closing) lastOpen.current = { title, children };
  });
  const shown = closing ? lastOpen.current : { title, children };

  useEffect(() => {
    openerRef.current ??= document.activeElement;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (openerRef.current instanceof HTMLElement && openerRef.current.isConnected) openerRef.current.focus();
    };
  }, []);

  useEffect(() => {
    titleRef.current?.focus();
  }, [shown.title]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => setContentHeight(content.offsetHeight));
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const latestOnExited = useRef(onExited);
  useLayoutEffect(() => {
    latestOnExited.current = onExited;
  });
  useEffect(() => {
    if (!closing) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => latestOnExited.current(), reducedMotion ? 0 : EXIT_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={onClose}
      className={`m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-5 pb-6 text-ink backdrop:bg-ink/50 sm:m-auto sm:max-w-md sm:rounded-2xl sm:p-6 ${
        closing
          ? "motion-safe:animate-sheet-out motion-safe:backdrop:animate-backdrop-out sm:motion-safe:animate-modal-out"
          : "motion-safe:animate-sheet-in motion-safe:backdrop:animate-backdrop-in sm:motion-safe:animate-modal-in"
      }`}
    >
      <div inert={closing}>
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 ref={titleRef} id={titleId} tabIndex={-1} className="font-display text-2xl leading-tight font-semibold text-forest outline-none">
            {shown.title}
          </h2>
          <button
            type="button"
            aria-label={t("dialog.close")}
            disabled={busy}
            onClick={onClose}
            className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-2xl text-muted transition-colors hover:bg-sage disabled:opacity-40"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        {/* The extra box space keeps focus rings from being clipped while the height animates. */}
        <div
          style={{ height: contentHeight }}
          className="-m-1 box-content overflow-hidden p-1 transition-[height] duration-200 ease-out motion-reduce:transition-none"
        >
          <div ref={contentRef}>
            <div key={shown.title} className="motion-safe:animate-content-in">
              {shown.children}
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
