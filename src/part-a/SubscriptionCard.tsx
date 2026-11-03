import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Subscription, SubscriptionItem } from "../api/types";
import { CancelFlow } from "./CancelFlow";
import { t } from "./copy/t";
import { Dialog, DIALOG_DESCRIPTION_ID, type DialogTransition } from "./Dialog";
import { formatCents, formatDate, shortName } from "./format";
import { PlanEditor } from "./PlanEditor";
import { SkipPanel } from "./SkipPanel";
import { cancelledPatch, nextChargeValues, reactivatedPatch, savingsPerShipmentCents } from "./subscriptionChanges";
import { track } from "./track";
import { inlineButton, primaryButton, secondaryButton, textButton } from "./ui";
import { useSkipShipment } from "./useSkipShipment";
import { useSlowFlag } from "./useSlowFlag";
import { useSubscription, type SubscriptionControls } from "./useSubscription";

type OpenDialog = "skip" | "cancel" | "reactivate" | "plan";

const MAX_LOAD_FAILURES_BEFORE_SUPPORT = 2;

const skipSuccessMessage = (updated: Subscription) => {
  const { amount, chargeDate } = nextChargeValues(updated);
  return t("skipSuccess.message", { amount, nextChargeDate: chargeDate });
};

export function SubscriptionCard() {
  const { subscription, frequencyBase, loadError, failedLoads, retryLoad, refresh, skip, applyChange } = useSubscription();
  const [openDialog, setOpenDialog] = useState<OpenDialog | null>(null);
  const [closingDialog, setClosingDialog] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const loading = !subscription && !loadError;
  const slowLoad = useSlowFlag(loading);
  const controls: SubscriptionControls = { refresh, skip };

  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  const open = (dialog: OpenDialog) => {
    if (dialog === "cancel" && subscription) track("cancel_flow_opened", { subscriptionId: subscription.id });
    setNotice(null);
    setOpenDialog(dialog);
  };
  const close = (message: string | null = null) => {
    if (closingDialog) return;
    setPendingNotice(message);
    setClosingDialog(true);
  };
  const handleExited = () => {
    setOpenDialog(null);
    setClosingDialog(false);
    setNotice(pendingNotice);
  };
  const transition = { closing: closingDialog, onExited: handleExited };
  const showLateSkip = (updated: Subscription) => setNotice(skipSuccessMessage(updated));

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6 sm:py-10">
      <h1 ref={headingRef} tabIndex={-1} className="font-display text-3xl font-semibold text-forest outline-none">
        {t("page.title")}
      </h1>

      <div role="status" className="sr-only">
        {loading && (slowLoad ? t("loading.slow") : t("loading.message"))}
        {subscription && t("loading.loaded")}
      </div>

      {loading && <LoadingState slow={slowLoad} />}
      {loadError === "failed" && (
        <div className="mt-6 rounded-2xl border border-line bg-white p-5">
          <p role="alert">{failedLoads >= MAX_LOAD_FAILURES_BEFORE_SUPPORT ? t("loadError.repeated") : t("loadError.message")}</p>
          <button
            type="button"
            className={`${primaryButton} mt-4`}
            onClick={() => {
              retryLoad();
              headingRef.current?.focus();
            }}
          >
            {t("loadError.retry")}
          </button>
        </div>
      )}
      {loadError === "not-found" && (
        <p role="alert" className="mt-6 rounded-2xl border border-line bg-white p-5">
          {t("loadError.notFound")}
        </p>
      )}

      {subscription && (
        <div className="mt-6 flex flex-col gap-4">
          {notice && (
            <p ref={noticeRef} tabIndex={-1} className="rounded-xl bg-sage p-4 font-medium text-forest outline-none motion-safe:animate-content-in">
              {notice}
            </p>
          )}
          <StatusSummary subscription={subscription} />
          <ProductList subscription={subscription} onChangePlan={() => open("plan")} />
          {subscription.status !== "cancelled" && (
            <p className="rounded-xl bg-sage p-4 text-forest">
              {t("savings.perShipment", { amount: formatCents(savingsPerShipmentCents(subscription)) })}
            </p>
          )}
          <Actions subscription={subscription} onOpen={open} />
        </div>
      )}

      {subscription && frequencyBase && openDialog === "plan" && (
        <PlanEditor
          subscription={subscription}
          frequencyBase={frequencyBase}
          onSave={(changes, updated) => {
            changes.forEach(applyChange);
            track("plan_updated", { subscriptionId: subscription.id, changes: changes.map(({ kind }) => kind) });
            close(t("cancelOutcome.offerApplied", nextChargeValues(updated)));
          }}
          transition={transition}
          onClose={() => close()}
        />
      )}

      {subscription && openDialog === "skip" && (
        <SkipDialog
          subscription={subscription}
          controls={controls}
          onSkipped={(updated) => {
            track("skip_completed", { subscriptionId: updated.id, source: "page" });
            close(skipSuccessMessage(updated));
          }}
          onSkippedAfterClose={(updated) => {
            track("skip_completed", { subscriptionId: updated.id, source: "page" });
            showLateSkip(updated);
          }}
          transition={transition}
          onClose={() => close()}
        />
      )}

      {subscription && frequencyBase && openDialog === "cancel" && (
        <CancelFlow
          subscription={subscription}
          frequencyBase={frequencyBase}
          controls={controls}
          onApply={(change) => {
            applyChange(change);
            close(t("cancelOutcome.offerApplied", nextChargeValues({ ...subscription, ...change.patch })));
          }}
          onSkipped={(updated) => close(skipSuccessMessage(updated))}
          onSkippedAfterClose={showLateSkip}
          onCancelled={() => {
            applyChange({ kind: "cancel", patch: cancelledPatch() });
            close(t("cancelOutcome.cancelled"));
          }}
          transition={transition}
          onClose={() => close()}
        />
      )}

      {subscription && openDialog === "reactivate" && (
        <ReactivateDialog
          subscription={subscription}
          onConfirm={() => {
            const patch = reactivatedPatch(subscription);
            const nextCharge = nextChargeValues({ ...subscription, ...patch });
            applyChange({ kind: subscription.status === "paused" ? "resume" : "restart", patch });
            close(subscription.status === "paused" ? t("resumeSuccess.message", nextCharge) : t("restartSuccess.message", nextCharge));
          }}
          transition={transition}
          onClose={() => close()}
        />
      )}
    </main>
  );
}

function LoadingState({ slow }: { slow: boolean }) {
  return (
    <div className="mt-6" aria-hidden="true">
      {slow && <p className="mb-4 text-muted">{t("loading.slow")}</p>}
      <div className="flex flex-col gap-4 motion-safe:animate-pulse">
        <div className="h-36 rounded-2xl bg-stone-tint" />
        <div className="h-44 rounded-2xl bg-stone-tint" />
      </div>
    </div>
  );
}

function StatusSummary({ subscription }: { subscription: Subscription }) {
  const { status, nextChargeAt, nextChargeTotalCents, intervalDays, pausedUntil, cancelledAt } = subscription;

  if (status === "paused") {
    return (
      <Banner label={t("pausedBanner.title")} className="bg-amber-tint text-amber-ink">
        {pausedUntil ? t("pausedBanner.message", { resumeDate: formatDate(pausedUntil) }) : t("pausedBanner.messageWithoutDate")}
      </Banner>
    );
  }
  if (status === "cancelled") {
    return (
      <Banner label={t("cancelledBanner.title")} className="bg-stone-tint text-ink">
        {cancelledAt ? t("cancelledBanner.message", { cancelledDate: formatDate(cancelledAt) }) : t("cancelledBanner.messageWithoutDate")}
      </Banner>
    );
  }

  return (
    <section aria-labelledby="next-charge-heading" className="rounded-2xl bg-forest p-5 text-white">
      <h2 id="next-charge-heading" className="text-sm font-medium tracking-wide uppercase">
        {t("nextCharge.heading")}
      </h2>
      <p className="mt-2 font-display text-4xl font-semibold">
        {nextChargeTotalCents !== null && formatCents(nextChargeTotalCents)}
      </p>
      <p className="mt-1 text-lg">{nextChargeAt && t("nextCharge.date", { chargeDate: formatDate(nextChargeAt) })}</p>
      <p className="mt-3 text-sm">{t("nextCharge.frequency", { days: intervalDays })}</p>
    </section>
  );
}

function Banner({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  return (
    <section className={`rounded-2xl p-5 ${className}`}>
      <h2 className="font-display text-2xl font-semibold">{label}</h2>
      <p className="mt-2">{children}</p>
    </section>
  );
}

function ProductList({ subscription, onChangePlan }: { subscription: Subscription; onChangePlan: () => void }) {
  const { status, items } = subscription;
  const cancelled = status === "cancelled";
  const heading = t(status === "active" ? "products.headingActive" : cancelled ? "products.headingCancelled" : "products.headingPaused");

  return (
    <section aria-labelledby="products-heading" className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 id="products-heading" className="font-semibold">
          {heading}
        </h2>
        {status === "active" && (
          <button type="button" className={inlineButton} onClick={onChangePlan}>
            {t("actions.changePlan")}
          </button>
        )}
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((item) => (
          <ProductRow key={item.sku} item={item} muted={cancelled} />
        ))}
      </ul>
    </section>
  );
}

function ProductRow({ item, muted }: { item: SubscriptionItem; muted: boolean }) {
  return (
    <li className="flex items-center gap-3">
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" className={`size-14 shrink-0 rounded-lg border border-line object-cover ${muted ? "grayscale" : ""}`} />
      ) : (
        <div aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-sage font-display text-xl text-forest">
          {shortName(item.name).charAt(0)}
        </div>
      )}
      <div className="min-w-0">
        <p className={`font-medium ${muted ? "text-muted" : ""}`}>{item.name}</p>
        <p className="text-sm text-muted">{t("products.quantity", { quantity: item.quantity })}</p>
      </div>
    </li>
  );
}

function Actions({ subscription, onOpen }: { subscription: Subscription; onOpen: (dialog: OpenDialog) => void }) {
  if (subscription.status === "cancelled") {
    return (
      <button type="button" className={primaryButton} onClick={() => onOpen("reactivate")}>
        {t("actions.restart")}
      </button>
    );
  }
  const active = subscription.status === "active";
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={active ? secondaryButton : primaryButton}
        onClick={() => onOpen(active ? "skip" : "reactivate")}
      >
        {active ? t("actions.skip") : t("actions.resume")}
      </button>
      <button type="button" className={textButton} onClick={() => onOpen("cancel")}>
        {t("actions.cancel")}
      </button>
    </div>
  );
}

interface SkipDialogProps {
  subscription: Subscription;
  controls: SubscriptionControls;
  onSkipped: (updated: Subscription) => void;
  onSkippedAfterClose: (updated: Subscription) => void;
  transition: DialogTransition;
  onClose: () => void;
}

function SkipDialog({ subscription, controls, onSkipped, onSkippedAfterClose, transition, onClose }: SkipDialogProps) {
  const skip = useSkipShipment(subscription, controls, { onSkipped, onSkippedAfterClose });
  return (
    <Dialog title={t("skipConfirm.title")} busy={skip.busy} transition={transition} onClose={onClose}>
      <SkipPanel skip={skip} subscription={subscription} onKeep={onClose} />
    </Dialog>
  );
}

interface ReactivateDialogProps {
  subscription: Subscription;
  onConfirm: () => void;
  transition: DialogTransition;
  onClose: () => void;
}

function ReactivateDialog({ subscription, onConfirm, transition, onClose }: ReactivateDialogProps) {
  const paused = subscription.status === "paused";
  const nextCharge = nextChargeValues({ ...subscription, ...reactivatedPatch(subscription) });
  return (
    <Dialog title={t(paused ? "resumeConfirm.title" : "restartConfirm.title")} transition={transition} onClose={onClose}>
      <p id={DIALOG_DESCRIPTION_ID} className="text-muted">{paused ? t("resumeConfirm.body", nextCharge) : t("restartConfirm.body", nextCharge)}</p>
      <div className="mt-5 flex flex-col gap-2">
        <button type="button" className={primaryButton} onClick={onConfirm}>
          {t(paused ? "resumeConfirm.confirm" : "restartConfirm.confirm")}
        </button>
        <button type="button" className={secondaryButton} onClick={onClose}>
          {t(paused ? "resumeConfirm.dismiss" : "restartConfirm.dismiss")}
        </button>
      </div>
    </Dialog>
  );
}
