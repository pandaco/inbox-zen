import en from '../../../../public/_locales/en/messages.json';
import fr from '../../../../public/_locales/fr/messages.json';

// chrome.i18n fails SILENTLY (empty string) on missing keys, so locale
// drift between en and fr would go unnoticed at runtime. Guard it here.
describe('_locales key parity', () => {
  it('en and fr define exactly the same keys', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it('no message is empty', () => {
    for (const [locale, messages] of Object.entries({ en, fr })) {
      for (const [key, value] of Object.entries(messages as Record<string, { message?: string }>)) {
        expect(value.message, `${locale}/${key}`).toBeTruthy();
      }
    }
  });
});
