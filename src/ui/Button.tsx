import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 min-h-10';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  secondary: 'border border-stone-300 bg-surface text-stone-800 hover:bg-stone-100',
  danger: 'bg-danger text-white hover:bg-danger-hover',
  ghost: 'text-stone-700 hover:bg-stone-200',
};

export const buttonClass = (variant: ButtonVariant = 'secondary', extra = ''): string =>
  `${base} ${variants[variant]} ${extra}`.trim();

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; children?: ReactNode }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}
