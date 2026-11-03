import { useId } from "react";
import { copy } from "./copy";
import { ChevronIcon, CheckIcon } from "./icons";
import type { PurchaseOption } from "./buyBoxState";

interface PurchaseOptionsProps {
  option: PurchaseOption;
  frequency: string;
  oneTimePrice: string;
  subscribePrice: string;
  comparePrice: string;
  onOptionChange: (option: PurchaseOption) => void;
  onFrequencyChange: (frequency: string) => void;
}

// The padding gives up what the thicker border takes, so the content doesn't move when selected.
const optionCard = (selected: boolean) =>
  `rounded-[14px] ${selected ? "border-2 border-bb-forest bg-bb-sage px-[19px]" : "border border-bb-option-line bg-white px-5"}`;

const optionLabel = "text-[16px]/[26px] font-semibold text-bb-ink";
const optionPrice = "text-[18px]/[22.5px] font-semibold text-bb-ink";

function Radio({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <span className="relative size-5 shrink-0">
      <input
        type="radio"
        name="purchase-option"
        checked={checked}
        onChange={onChange}
        className="peer block size-5 cursor-pointer appearance-none rounded-full border-[1.5px] border-bb-radio bg-white checked:border-bb-forest"
      />
      <span className="pointer-events-none absolute inset-[5px] hidden rounded-full bg-bb-forest peer-checked:block" />
    </span>
  );
}

export function PurchaseOptions({
  option,
  frequency,
  oneTimePrice,
  subscribePrice,
  comparePrice,
  onOptionChange,
  onFrequencyChange,
}: PurchaseOptionsProps) {
  const frequencyId = useId();
  const subscribed = option === "subscribe";

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="sr-only">Purchase option</legend>

      <label className={`flex h-[60px] cursor-pointer items-center gap-3 ${optionCard(!subscribed)}`}>
        <Radio checked={!subscribed} onChange={() => onOptionChange("oneTime")} />
        <span className={`flex-1 ${optionLabel}`}>{copy.oneTime.label}</span>
        <span className={optionPrice}>{oneTimePrice}</span>
      </label>

      <div className={`${optionCard(subscribed)} ${subscribed ? "pt-[16.75px] pb-[15px]" : ""}`}>
        <label className={`flex cursor-pointer items-center gap-3 ${subscribed ? "" : "min-h-[58px]"}`}>
          <Radio checked={subscribed} onChange={() => onOptionChange("subscribe")} />
          <span className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <span className={optionLabel}>{copy.subscribe.label}</span>
            <span className="rounded-full bg-bb-badge px-2.5 text-[11px]/[21px] font-bold tracking-[0.08em] text-bb-badge-ink uppercase">
              {copy.subscribe.badge}
            </span>
          </span>
          <span className="flex flex-col items-end">
            <span className={optionPrice}>{subscribePrice}</span>
            <s className="mt-0.5 text-[13px]/[15px] text-bb-strike">
              <span className="sr-only">Regular price </span>
              {comparePrice}
            </s>
          </span>
        </label>

        {subscribed && (
          <div className="mt-[14.25px] pl-8">
            <div className="flex items-center gap-2.5">
              <label htmlFor={frequencyId} className="text-[14px]/[33px] text-bb-body">
                {copy.subscribe.frequencyLabel}
              </label>
              <span className="relative">
                <select
                  id={frequencyId}
                  value={frequency}
                  onChange={(event) => onFrequencyChange(event.target.value)}
                  className="block h-[33px] w-[115.5px] cursor-pointer appearance-none rounded-[8px] border border-bb-control-line bg-white pl-3 text-[14px] font-medium text-bb-ink"
                >
                  {copy.subscribe.frequencyOptions.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute top-[13.5px] right-3.5 text-bb-body">
                  <ChevronIcon />
                </span>
              </span>
            </div>
            <ul className="mt-3 flex flex-col gap-1">
              {copy.subscribe.perks.map((perk) => (
                <li key={perk} className="flex items-center gap-2 text-[14px]/[21px] text-bb-ink">
                  <span className="shrink-0 text-bb-forest">
                    <CheckIcon />
                  </span>
                  {perk}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </fieldset>
  );
}
