import { useId, useState, type ReactNode } from "react";
import type { Subscription } from "../api/types";
import { t, type CopyKey } from "./copy/t";
import { Dialog, DIALOG_DESCRIPTION_ID, type DialogTransition } from "./Dialog";
import { formatDate, shortName } from "./format";
import { RadioCard } from "./RadioCard";
import { SkipPanel } from "./SkipPanel";
import {
  hasOffers,
  SKIP_OFFER_ID,
  offersFor,
  swapOffers,
  swappableItems,
  type CancelReason,
  type FrequencyBase,
  type Offer,
  type SubscriptionChange,
} from "./subscriptionChanges";
import { track } from "./track";
import { primaryButton, secondaryButton, textButton } from "./ui";
import { useSkipShipment } from "./useSkipShipment";
import type { SubscriptionControls } from "./useSubscription";

interface CancelFlowProps {
  subscription: Subscription;
  frequencyBase: FrequencyBase;
  controls: SubscriptionControls;
  onApply: (change: SubscriptionChange) => void;
  onSkipped: (updated: Subscription) => void;
  onSkippedAfterClose: (updated: Subscription) => void;
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

export function CancelFlow({
  subscription,
  frequencyBase,
  controls,
  onApply,
  onSkipped,
  onSkippedAfterClose,
  onCancelled,
  transition,
  onClose,
}: CancelFlowProps) {
  // The offers change an active subscription's next charge, so a paused one has nothing to offer.
  const [step, setStep] = useState<Step>(subscription.status === "active" ? "reason" : "confirm");
  const [reason, setReason] = useState<CancelReason | null>(null);
  const subscriptionId = subscription.id;
  const trackSkip = () => {
    // A skip offer only counts as accepted once the skip goes through.
    if (reason) track("cancel_offer_accepted", { subscriptionId, reason, offerId: SKIP_OFFER_ID });
    track("skip_completed", { subscriptionId, source: "cancel_flow" });
  };
  const skip = useSkipShipment(subscription, controls, {
    onSkipped: (updated) => {
      trackSkip();
      onSkipped(updated);
    },
    onSkippedAfterClose: (updated) => {
      trackSkip();
      onSkippedAfterClose(updated);
    },
  });

  const titleKey = step === "offer" ? reason && OFFER_TITLES[reason] : STEP_TITLES[step];
  const title = titleKey ? t(titleKey) : "";

  function chooseReason(chosen: CancelReason) {
    const showsOffers = hasOffers(chosen, subscription, frequencyBase);
    track("cancel_reason_selected", { subscriptionId, reason: chosen });
    if (showsOffers) track("cancel_offer_shown", { subscriptionId, reason: chosen });
    setReason(chosen);
    setStep(showsOffers ? "offer" : "confirm");
  }

  function chooseOffer(offer: Offer, chosenReason: CancelReason) {
    if (offer.kind === "skip") {
      setStep("skip");
      return;
    }
    track("cancel_offer_accepted", { subscriptionId, reason: chosenReason, offerId: offer.id });
    onApply(offer.change);
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
          frequencyBase={frequencyBase}
          onChoose={(offer) => chooseOffer(offer, reason)}
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
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                track("cancel_completed", { subscriptionId, reason });
                onCancelled();
              }}
            >
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
  frequencyBase: FrequencyBase;
  onChoose: (offer: Offer) => void;
  footer: ReactNode;
}

function OfferStep({ reason, subscription, frequencyBase, onChoose, footer }: OfferStepProps) {
  const replaceable = swappableItems(subscription);
  const [replacedSku, setReplacedSku] = useState(replaceable[0]?.sku);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const replaced = replaceable.find((item) => item.sku === replacedSku);
  const offers = reason === "different" ? (replaced ? swapOffers(subscription, replaced) : []) : offersFor(reason, subscription, frequencyBase);
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
