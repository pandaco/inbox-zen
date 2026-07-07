import { Pipe, PipeTransform } from '@angular/core';

/**
 * Translate a chrome.i18n message key.
 *
 * The locale is resolved by Chrome from the browser UI language against
 * `_locales/<locale>/messages.json`, falling back to `default_locale`.
 * Missing keys resolve to the key itself (chrome returns '' silently,
 * which would hide bugs — the key is at least greppable).
 */
export function t(key: string, ...substitutions: (string | number)[]): string {
  const message = chrome.i18n.getMessage(key, substitutions.map(String));
  return message || key;
}

@Pipe({ name: 't' })
export class TranslatePipe implements PipeTransform {
  transform(key: string, ...substitutions: (string | number)[]): string {
    return t(key, ...substitutions);
  }
}
