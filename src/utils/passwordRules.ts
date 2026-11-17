/**
 * New-password rule, identical to the server's (`/user/my-account` and
 * `/user/initial-password-reset`). Checked here only to give the message
 * before a round trip; the server stays the authority and its own error
 * message is shown when it refuses a password.
 */
export const PASSWORD_RULE =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;

export const PASSWORD_RULE_TEXT =
  "Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a special character.";
