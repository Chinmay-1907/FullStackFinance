import type { ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

export const Button = ({ variant = "primary", className, ...props }: ButtonProps) => {
  const base =
    "inline-flex items-center justify-center rounded-lg border text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

  type ButtonVariant = NonNullable<ButtonProps["variant"]>;
  const variants: Record<ButtonVariant, string> = {
    primary:
      "border-transparent bg-brand text-white shadow hover:bg-brand-dark focus-visible:outline-brand-dark",
    secondary:
      "border-slate-300 bg-white text-slate-900 hover:bg-slate-50 focus-visible:outline-slate-400",
    ghost: "border-transparent text-slate-600 hover:bg-slate-100 focus-visible:outline-slate-400",
  };

  return <button className={clsx(base, variants[variant], className)} {...props} />;
};
