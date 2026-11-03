import { MinusIcon, PlusIcon } from "./icons";

interface QuantityStepperProps {
  quantity: number;
  atMin: boolean;
  atMax: boolean;
  onChange: (quantity: number) => void;
}

const stepButton =
  "flex h-full w-[46px] items-center justify-center pt-[3px] text-bb-body aria-disabled:cursor-not-allowed";

export function QuantityStepper({ quantity, atMin, atMax, onChange }: QuantityStepperProps) {
  // aria-disabled, because a disabled button would drop keyboard focus when it reaches a limit.
  return (
    <div
      role="group"
      aria-label="Quantity"
      className="flex h-14 w-32 shrink-0 items-center justify-between rounded-[11.5px] border border-bb-control-line bg-white"
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        aria-disabled={atMin}
        className={stepButton}
        onClick={() => {
          if (!atMin) onChange(quantity - 1);
        }}
      >
        <MinusIcon />
      </button>
      <output className="pb-px text-center text-[17px] font-medium text-bb-ink">{quantity}</output>
      <button
        type="button"
        aria-label="Increase quantity"
        aria-disabled={atMax}
        className={stepButton}
        onClick={() => {
          if (!atMax) onChange(quantity + 1);
        }}
      >
        <PlusIcon />
      </button>
    </div>
  );
}
