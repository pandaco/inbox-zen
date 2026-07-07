import {
  allOtpPatterns,
  allParcelPatterns,
  allInvitePatterns,
  allUnsubscribeQueryTerms,
} from './locale-patterns';

const matchesAny = (patterns: RegExp[], subject: string): boolean =>
  patterns.some(p => p.test(subject));

describe('OTP patterns', () => {
  it.each([
    'Your verification code is 123456',
    'OTP for your login',
    'Security alert on your account',
    'Réinitialisez votre mot de passe',
    'Alerte de sécurité',
  ])('matches "%s"', subject => {
    expect(matchesAny(allOtpPatterns, subject)).toBe(true);
  });

  it.each(['Weekly newsletter', 'Votre facture de mars'])('does not match "%s"', subject => {
    expect(matchesAny(allOtpPatterns, subject)).toBe(false);
  });
});

describe('parcel patterns', () => {
  it.each([
    'Your delivery is on its way',
    'Shipping confirmation #4521',
    'Order 8791 confirmed',
    'Votre colis est arrivé',
    'Livraison prévue demain',
    'Expédition confirmée',
    'Votre commande a été envoyée',
  ])('matches "%s"', subject => {
    expect(matchesAny(allParcelPatterns, subject)).toBe(true);
  });

  it.each(['Meeting notes', 'Compte rendu de réunion'])('does not match "%s"', subject => {
    expect(matchesAny(allParcelPatterns, subject)).toBe(false);
  });
});

describe('invite patterns', () => {
  it.each(['invite.ics attached', 'Updated: Google Calendar event'])('matches "%s"', subject => {
    expect(matchesAny(allInvitePatterns, subject)).toBe(true);
  });

  it('does not match a plain meeting subject', () => {
    expect(matchesAny(allInvitePatterns, 'Meeting tomorrow at 10')).toBe(false);
  });
});

describe('unsubscribe query terms', () => {
  it('covers both locales', () => {
    expect(allUnsubscribeQueryTerms).toContain('unsubscribe');
    expect(allUnsubscribeQueryTerms).toContain('"se désinscrire"');
  });
});
