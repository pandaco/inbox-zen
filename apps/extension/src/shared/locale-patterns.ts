/**
 * Locale-specific matching heuristics for email classification.
 *
 * Matching always uses the union of every locale regardless of the UI
 * language: the language of received emails is independent of the browser
 * locale (a French user receives English newsletters and vice versa).
 */

export interface LocalePatterns {
  /** Subjects that look like one-time codes / password resets. */
  otpSubjectPatterns: RegExp[];
  /** Subjects that look like parcel/delivery notifications. */
  parcelSubjectPatterns: RegExp[];
  /** Subjects that look like calendar invitations. */
  inviteSubjectPatterns: RegExp[];
  /** Gmail search terms used to find unsubscribe links. */
  unsubscribeQueryTerms: string[];
}

export const en: LocalePatterns = {
  otpSubjectPatterns: [/code/i, /otp/i, /verification/i, /security/i],
  parcelSubjectPatterns: [/delivery/i, /shipping/i, /order/i],
  inviteSubjectPatterns: [/invite\.ics/i, /google calendar/i],
  unsubscribeQueryTerms: ['unsubscribe'],
};

export const fr: LocalePatterns = {
  otpSubjectPatterns: [/votre mot de passe/i, /sécurité/i],
  parcelSubjectPatterns: [/colis/i, /livraison/i, /expédition/i, /command/i, /envoyé/i],
  inviteSubjectPatterns: [],
  unsubscribeQueryTerms: ['"se désinscrire"', '"se désabonner"'],
};

const locales = [en, fr];

function union(pick: (l: LocalePatterns) => RegExp[]): RegExp[] {
  return locales.flatMap(pick);
}

export const allOtpPatterns = union(l => l.otpSubjectPatterns);
export const allParcelPatterns = union(l => l.parcelSubjectPatterns);
export const allInvitePatterns = union(l => l.inviteSubjectPatterns);
export const allUnsubscribeQueryTerms = locales.flatMap(l => l.unsubscribeQueryTerms);
