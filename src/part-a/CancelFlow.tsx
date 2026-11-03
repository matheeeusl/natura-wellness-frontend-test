import { useId, useState, type ReactNode } from "react";
import type { Subscription } from "../api/types";
import { t, type CopyKey } from "./copy/t";
import { Dialog, DIALOG_DESCRIPTION_ID, type DialogTransition } from "./Dialog";
import { formatDate, shortName } from "./format";
import { SkipPanel } from "./SkipPanel";
import {
  hasOffers,
  offersFor,
  swapOffers,
  swappableItems,
  type CancelReason,
  type Offer,
  type SubscriptionPatch,
} from "./subscriptionChanges";
import { primaryButton, secondaryButton, textButton } from "./ui";
import { useSkipShipment } from "./useSkipShipment";
import type { SubscriptionControls } from "./useSubscription";

interface CancelFlowProps {
  subscription: Subscription;
  controls: SubscriptionControls;
  onApply: (patch: SubscriptionPatch) => void;
  onSkipped: (updated: Subscription) => void;
  onCancelled: () => void;
  transition: DialogTransition;
  onClose: () => void;
}

type Step = "reason" | "offer" | "skip" | "confirm";

type TitleKey = Extract<CopyKey, `${string}.title`>;

const REASONS: { id: CancelReason; labelKey: Extract<CopyKey, `cancelReason.${string}`> }[] = [
  { id: "too-much", labelKey: "cancelReason.tooMuchProduct" },
  { id: "cost", labelKey: "cancelReason.tooExpensive" },
  { id: "different", labelKey: "cancelReason.differentProduct" },
  { id: "no-results", labelKey: "cancelReason.noResults" },
  { id: "other", labelKey: "cancelReason.other" },
];

const OFFER_TITLES: Partial<Record<CancelReason, TitleKey>> = {
  "too-much": "tooMuchProductOffer.title",
  cost: "tooExpensiveOffer.title",
  different: "swapOffer.title",
};

const STEP_TITLES: Record<Exclude<Step, "offer">, TitleKey> = {
  reason: "cancelReason.title",
  skip: "skipConfirm.title",
  confirm: "cancelConfirm.title",
};

export function CancelFlow({ subscription, controls, onApply, onSkipped, onCancelled, transition, onClose }: CancelFlowProps) {
  // A paused subscription has no upcoming charge to change, so there's nothing to offer.
  const [step, setStep] = useState<Step>(subscription.status === "active" ? "reason" : "confirm");
  const [reason, setReason] = useState<CancelReason | null>(null);
  const skip = useSkipShipment(controls, onSkipped);

  const titleKey = step === "offer" ? reason && OFFER_TITLES[reason] : STEP_TITLES[step];
  const title = titleKey ? t(titleKey) : "";

  function chooseReason(chosen: CancelReason) {
    setReason(chosen);
    setStep(hasOffers(chosen, subscription) ? "offer" : "confirm");
  }

  const continueToCancel = (
    <button type="button" className={textButton} disabled={skip.busy} onClick={() => setStep("confirm")}>
      {t("cancelOffer.continueToCancel")}
    </button>
  );

  return (
    <Dialog title={title} busy={skip.busy} hasDescription={step !== "offer"} transition={transition} onClose={onClose}>
      {step === "reason" && (
        <>
          <p id={DIALOG_DESCRIPTION_ID} className="text-muted">{t("cancelReason.body")}</p>
          <ul className="mt-4 flex flex-col gap-2">
            {REASONS.map(({ id, labelKey }) => (
              <li key={id}>
                <button type="button" className={`${secondaryButton} font-medium`} onClick={() => chooseReason(id)}>
                  {t(labelKey)}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2">{continueToCancel}</div>
        </>
      )}

      {step === "offer" && reason && (
        <OfferStep
          reason={reason}
          subscription={subscription}
          onChoose={(offer) => (offer.kind === "skip" ? setStep("skip") : onApply(offer.patch))}
          footer={continueToCancel}
        />
      )}

      {step === "skip" && (
        <SkipPanel
          skip={skip}
          subscription={subscription}
          onKeep={onClose}
          footer={continueToCancel}
        />
      )}

      {step === "confirm" && (
        <>
          <p id={DIALOG_DESCRIPTION_ID} className="text-muted">
            {subscription.nextChargeAt
              ? t("cancelConfirm.body", { shipmentDate: formatDate(subscription.nextChargeAt) })
              : t("cancelConfirm.bodyWithoutShipment")}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button type="button" className={primaryButton} onClick={onCancelled}>
              {t("cancelConfirm.confirm")}
            </button>
            <button type="button" className={secondaryButton} onClick={onClose}>
              {t("cancelConfirm.keep")}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

interface OfferStepProps {
  reason: CancelReason;
  subscription: Subscription;
  onChoose: (offer: Offer) => void;
  footer: ReactNode;
}

function OfferStep({ reason, subscription, onChoose, footer }: OfferStepProps) {
  const replaceable = swappableItems(subscription);
  const [replacedSku, setReplacedSku] = useState(replaceable[0]?.sku);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const replaced = replaceable.find((item) => item.sku === replacedSku);
  const offers = reason === "different" ? (replaced ? swapOffers(subscription, replaced) : []) : offersFor(reason, subscription);
  const selected = offers.find((offer) => offer.id === selectedId);
  const hintId = useId();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (selected) onChoose(selected);
      }}
    >
      {reason === "different" && replaceable.length > 1 && (
        <fieldset className="mb-4">
          <legend className="mb-2 font-medium">{t("swapOffer.itemLegend")}</legend>
          <div className="flex flex-col gap-2">
            {replaceable.map((item) => (
              <RadioCard
                key={item.sku}
                name="replaced-item"
                label={shortName(item.name)}
                checked={item.sku === replacedSku}
                onChange={() => {
                  setReplacedSku(item.sku);
                  setSelectedId(null);
                }}
              />
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="sr-only">{t("cancelOffer.legend")}</legend>
        <div className="flex flex-col gap-2">
          {offers.map((offer) => (
            <RadioCard
              key={offer.id}
              name="offer"
              label={offer.label}
              checked={offer.id === selectedId}
              onChange={() => setSelectedId(offer.id)}
            />
          ))}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-col gap-2">
        {!selected && (
          <p id={hintId} className="text-sm text-muted">
            {t("cancelOffer.selectHint")}
          </p>
        )}
        <button type="submit" className={primaryButton} aria-disabled={!selected} aria-describedby={selected ? undefined : hintId}>
          {t("cancelOffer.apply")}
        </button>
        {footer}
      </div>
    </form>
  );
}

interface RadioCardProps {
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}

function RadioCard({ name, label, checked, onChange }: RadioCardProps) {
  return (
    <label
      className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 ${checked ? "border-forest bg-sage" : "border-line bg-white"}`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 size-4 shrink-0 accent-forest" />
      <span>{label}</span>
    </label>
  );
}

