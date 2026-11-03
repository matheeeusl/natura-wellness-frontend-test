import { t } from "./copy/t";
import { formatCents } from "./format";
import { RadioCard } from "./RadioCard";
import { FREQUENCY_OPTIONS, monthlyCents } from "./subscriptionChanges";

interface FrequencyOptionsProps {
  selected: number;
  totalCents: number;
  onChange: (days: number) => void;
}

export function FrequencyOptions({ selected, totalCents, onChange }: FrequencyOptionsProps) {
  return (
    <fieldset>
      <legend className="mb-2 font-medium">{t("planEditor.frequencyLegend")}</legend>
      <div className="flex flex-col gap-2">
        {FREQUENCY_OPTIONS.map((days) => (
          <RadioCard
            key={days}
            name="frequency"
            label={t("planEditor.frequencyOption", { days, monthlyAmount: formatCents(monthlyCents(totalCents, days)) })}
            checked={days === selected}
            onChange={() => onChange(days)}
          />
        ))}
      </div>
    </fieldset>
  );
}
