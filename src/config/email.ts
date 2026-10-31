// Email notifications. The email provider's free plan allows 100 emails a
// day, and sign in links go through the same account. Notifications use at
// most EMAILS_PER_DAY of them, and one hourly run sends at most
// EMAILS_PER_RUN, so a busy hour cannot use up the day.
export const EMAILS_PER_DAY = 60;
export const EMAILS_PER_RUN = 20;
// Events listed in one email; the rest are counted.
export const EMAIL_ITEMS_MAX = 20;
