import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'sm' | 'xs' | 'icon';

const base =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const sizes: Record<ButtonSize, string> = {
  md: 'min-h-9 px-3.5 py-1.5 text-sm',
  sm: 'min-h-8 px-2.5 py-1 text-xs',
  xs: 'min-h-7 px-2 py-0.5 text-xs',
  icon: 'h-8 w-8 p-0 text-sm',
};

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white shadow-xs hover:bg-primary-hover',
  secondary: 'border border-stone-300 bg-surface text-stone-800 hover:bg-stone-100',
  danger: 'bg-danger text-white shadow-xs hover:bg-danger-hover',
  ghost: 'text-stone-700 hover:bg-stone-200/70',
};

export const buttonClass = (
  variant: ButtonVariant = 'secondary',
  extra = '',
  size: ButtonSize = 'md',
): string => `${base} ${sizes[size]} ${variants[variant]} ${extra}`.trim();

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}) {
  return <button type={type} className={buttonClass(variant, className, size)} {...props} />;
}
