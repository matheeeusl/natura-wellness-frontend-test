interface RadioCardProps {
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}

export function RadioCard({ name, label, checked, onChange }: RadioCardProps) {
  return (
    <label
      className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 ${checked ? "border-forest bg-sage" : "border-line bg-white"}`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 size-4 shrink-0 accent-forest" />
      <span>{label}</span>
    </label>
  );
}
