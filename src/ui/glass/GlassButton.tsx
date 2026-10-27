import type { ButtonHTMLAttributes } from 'react';

export function GlassButton({
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`glass glass-button ${className}`.trim()} {...props} />;
}
