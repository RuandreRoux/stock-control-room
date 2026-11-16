/**
 * The rules every new password must meet. Shared by the server (which enforces them)
 * and the password screen (which shows them being ticked off as you type).
 */
export interface PasswordRule {
  label: string;
  ok: boolean;
}

export const MIN_PASSWORD_LENGTH = 8;

export function passwordRules(password: string): PasswordRule[] {
  return [
    { label: `At least ${MIN_PASSWORD_LENGTH} characters`, ok: password.length >= MIN_PASSWORD_LENGTH },
    { label: "An upper-case letter (A-Z)", ok: /[A-Z]/.test(password) },
    { label: "A lower-case letter (a-z)", ok: /[a-z]/.test(password) },
    { label: "A number (0-9)", ok: /[0-9]/.test(password) },
    { label: "A special character (for example ! ? # -)", ok: /[^A-Za-z0-9]/.test(password) },
  ];
}
