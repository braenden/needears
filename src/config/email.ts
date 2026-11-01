// Account security emails (a way to sign in added or removed, the email
// address changed). The email provider's free plan allows 100 emails a day,
// and sign in links go through the same account, so security emails use at
// most EMAILS_PER_DAY of them, and one hourly run sends at most
// EMAILS_PER_RUN.
export const EMAILS_PER_DAY = 60;
export const EMAILS_PER_RUN = 20;
