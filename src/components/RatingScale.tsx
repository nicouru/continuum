"use client";

export function RatingScale({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm text-neutral-700">{label}</legend>
      <div className="flex flex-wrap gap-3">
        {[1, 2, 3, 4, 5].map((score) => (
          <label key={score} className="inline-flex items-center gap-1 text-sm">
            <input
              type="radio"
              name={label}
              value={score}
              checked={value === score}
              disabled={disabled}
              onChange={() => onChange(score)}
            />
            {score}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
