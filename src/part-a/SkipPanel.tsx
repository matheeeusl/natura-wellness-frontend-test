import { useEffect, useRef, type ReactNode } from "react";
import type { Subscription } from "../api/types";
import { t } from "./copy/t";
import { DIALOG_DESCRIPTION_ID } from "./Dialog";
import { formatCents, formatDate } from "./format";
import { addDays } from "./subscriptionChanges";
import { primaryButton, secondaryButton } from "./ui";
import type { SkipShipment } from "./useSkipShipment";
import { useSlowFlag } from "./useSlowFlag";

interface SkipPanelProps {
  skip: SkipShipment;
  subscription: Subscription;
  onKeep: () => void;
  /** Extra actions under the main buttons, used by the cancel flow. */
  footer?: ReactNode;
}

const MAX_ATTEMPTS_BEFORE_SUPPORT = 2;

function skipMessage({ phase, failure, failedAttempts }: SkipShipment, subscription: Subscription) {
  const { id: subscriptionId, nextChargeAt, nextChargeTotalCents, intervalDays } = subscription;
  const repeated = failedAttempts >= MAX_ATTEMPTS_BEFORE_SUPPORT;

  if (phase === "refreshing") return t("skipProgress.conflictRefreshing");
  if (phase === "rechecking") return t("skipProgress.refreshing");
  if (failure === "inactive") return t("skipFailure.noLongerActive");
  if (failure === "unknown") return repeated ? t("skipFailure.unconfirmedRepeated", { subscriptionId }) : t("skipFailure.unconfirmed");
  if (!nextChargeAt || nextChargeTotalCents === null) return "";

  const values = {
    amount: formatCents(nextChargeTotalCents),
    currentChargeDate: formatDate(nextChargeAt),
    nextChargeDate: formatDate(addDays(nextChargeAt, intervalDays)),
  };
  const { amount, currentChargeDate } = values;

  if (failure && repeated) return t("skipFailure.repeated", { currentChargeDate, amount, subscriptionId });
  if (failure === "conflict") return t("skipConflict.body", values);
  if (failure === "error") return t("skipFailure.body", { amount, currentChargeDate });
  return t("skipConfirm.body", values);
}

function primaryLabel({ phase, failure, failedAttempts }: SkipShipment) {
  if (phase === "rechecking" || phase === "refreshing") return t("skipProgress.checking");
  if (phase === "skipping") return t("skipProgress.submitting");
  if (failure === "unknown") return t("skipFailure.refreshDetails");
  if (failure === "error" || (failure === "conflict" && failedAttempts >= MAX_ATTEMPTS_BEFORE_SUPPORT)) return t("skipFailure.retry");
  return t("skipConfirm.confirm");
}

export function SkipPanel({ skip, subscription, onKeep, footer }: SkipPanelProps) {
  const slow = useSlowFlag(skip.phase === "skipping");
  const inactive = !skip.busy && skip.failure === "inactive";
  const showsFailure = !skip.busy && skip.failure !== null;
  const secondaryRef = useRef<HTMLButtonElement>(null);

  // The primary button goes away when skipping is no longer possible, so keep focus in the dialog.
  useEffect(() => {
    if (inactive) secondaryRef.current?.focus();
  }, [inactive]);

  return (
    <>
      <div id={DIALOG_DESCRIPTION_ID} role="status" className={showsFailure ? "text-danger" : "text-muted"}>
        <p>{skipMessage(skip, subscription)}</p>
        {showsFailure && skip.changesDropped && <p className="mt-2">{t("skipConflict.changesNotKept")}</p>}
        {slow && <p className="mt-2 text-muted">{t("skipProgress.slow")}</p>}
      </div>
      <div className="mt-5 flex flex-col gap-2">
        {!inactive && (
          <button
            type="button"
            className={primaryButton}
            // aria-disabled, not disabled, so keyboard focus stays here. useSkipShipment ignores repeat presses.
            aria-disabled={skip.busy}
            onClick={skip.failure === "unknown" ? skip.recheck : skip.submit}
          >
            {primaryLabel(skip)}
          </button>
        )}
        <button ref={secondaryRef} type="button" className={secondaryButton} disabled={skip.busy} onClick={onKeep}>
          {inactive ? t("skipFailure.close") : t("skipConfirm.keep")}
        </button>
        {footer}
      </div>
    </>
  );
}
