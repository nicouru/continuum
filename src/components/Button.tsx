import type { ButtonHTMLAttributes } from "react";

const VARIANTS = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-800",
  secondary: "border border-neutral-400 bg-white text-neutral-900 hover:bg-neutral-100",
  danger: "border border-red-300 bg-white text-red-800 hover:bg-red-50",
} as const;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
}) {
  return (
    <button
      className={`rounded px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
