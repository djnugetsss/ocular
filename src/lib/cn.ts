import { twMerge } from 'tailwind-merge';

type ClassValue = string | false | null | undefined;

/**
 * Joins class names, letting later classes win over earlier ones.
 *
 * `twMerge` is what makes component-level overrides work: without it,
 * `<Button className="bg-signal-bad" />` would produce `bg-accent bg-signal-bad`
 * and NativeWind resolves that by source order, not by intent — so the override
 * would be ignored roughly half the time depending on stylesheet ordering.
 */
export function cn(...classes: ClassValue[]): string {
  return twMerge(classes.filter(Boolean).join(' '));
}
