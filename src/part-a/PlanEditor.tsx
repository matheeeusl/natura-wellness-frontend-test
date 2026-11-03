import { useId, useState } from "react";
import { totalAfterDiscount } from "../api/fixtures";
import type { Subscription, SubscriptionItem } from "../api/types";
import { t } from "./copy/t";
import { Dialog, DIALOG_DESCRIPTION_ID, type DialogTransition } from "./Dialog";
import { FrequencyOptions } from "./FrequencyOptions";
import { shortName } from "./format";
import { QuantityStepper } from "./QuantityStepper";
import { frequencyChange, nextChargeValues, quantityChange, type FrequencyBase, type SubscriptionChange } from "./subscriptionChanges";
import { primaryButton } from "./ui";

interface PlanEditorProps {
  subscription: Subscription;
  frequencyBase: FrequencyBase;
  onSave: (changes: SubscriptionChange[], updated: Subscription) => void;
  transition: DialogTransition;
  onClose: () => void;
}

function previewMessage(current: Subscription, draft: Subscription) {
  const values = nextChargeValues(draft);
  const chargeStays = draft.nextChargeAt === current.nextChargeAt && draft.nextChargeTotalCents === current.nextChargeTotalCents;
  return draft.intervalDays !== current.intervalDays && chargeStays
    ? t("planEditor.previewChargeStays", { ...values, days: draft.intervalDays })
    : t("planEditor.preview", values);
}

export function PlanEditor({ subscription, frequencyBase, onSave, transition, onClose }: PlanEditorProps) {
  const [days, setDays] = useState(subscription.intervalDays);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const hintId = useId();

  const quantityOf = (item: SubscriptionItem) => quantities[item.sku] ?? item.quantity;
  const changes = [
    ...(days === subscription.intervalDays ? [] : [frequencyChange(frequencyBase, days)]),
    ...(subscription.items.every((item) => quantityOf(item) === item.quantity) ? [] : [quantityChange(subscription, quantities)]),
  ];
  const draft = changes.reduce((updated, { patch }) => ({ ...updated, ...patch }), subscription);
  const hasChanges = changes.length > 0;

  return (
    <Dialog title={t("planEditor.title")} transition={transition} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (hasChanges) onSave(changes, draft);
        }}
      >
        <FrequencyOptions selected={days} totalCents={totalAfterDiscount(draft.items, draft.discountPercent)} onChange={setDays} />
        <ul className="mt-4 flex flex-col gap-2">
          {subscription.items.map((item) => (
            <li key={item.sku}>
              <QuantityStepper
                product={shortName(item.name)}
                quantity={quantityOf(item)}
                onChange={(quantity) => setQuantities({ ...quantities, [item.sku]: quantity })}
              />
            </li>
          ))}
        </ul>
        <p id={DIALOG_DESCRIPTION_ID} role="status" className="mt-4 rounded-xl bg-sage p-4 text-forest">
          {previewMessage(subscription, draft)}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {!hasChanges && (
            <p id={hintId} className="text-sm text-muted">
              {t("planEditor.changeHint")}
            </p>
          )}
          <button type="submit" className={primaryButton} aria-disabled={!hasChanges} aria-describedby={hasChanges ? undefined : hintId}>
            {t("planEditor.save")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
