import { useId } from "react";
import { t } from "./copy/t";
import { MAX_QUANTITY, MIN_QUANTITY } from "./subscriptionChanges";

interface QuantityStepperProps {
  product: string;
  quantity: number;
  onChange: (quantity: number) => void;
}

const stepButton =
  "flex size-11 items-center justify-center rounded-full border border-forest text-xl text-forest transition-[background-color] hover:bg-sage aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent";

export function QuantityStepper({ product, quantity, onChange }: QuantityStepperProps) {
  const labelId = useId();
  const atMin = quantity <= MIN_QUANTITY;
  const atMax = quantity >= MAX_QUANTITY;

  // aria-disabled, because a disabled button would drop keyboard focus when it reaches a limit.
  return (
    <div className="flex items-center justify-between gap-3">
      <span id={labelId} className="font-medium">
        {t("planEditor.quantityLabel", { product })}
      </span>
      <div role="group" aria-labelledby={labelId} className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={t("planEditor.decreaseQuantity", { product })}
          aria-disabled={atMin}
          className={stepButton}
          onClick={() => {
            if (!atMin) onChange(quantity - 1);
          }}
        >
          <span aria-hidden="true">&minus;</span>
        </button>
        <output className="w-8 text-center font-semibold">{quantity}</output>
        <button
          type="button"
          aria-label={t("planEditor.increaseQuantity", { product })}
          aria-disabled={atMax}
          className={stepButton}
          onClick={() => {
            if (!atMax) onChange(quantity + 1);
          }}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  );
}
