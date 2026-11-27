// =====================================================================
//  TEEN RULES - written in plain English so the team can edit them.
//  These rules are given to the AI and decide the 🟢 / 🟡 / 🔴 verdict.
//  Change the wording here, push to GitHub, and the website updates.
// =====================================================================

export const TEEN_TOPICS = [
  { key: 'age', title: 'Age rules' },
  { key: 'data_collected', title: 'What they collect about you' },
  { key: 'data_shared', title: 'Who they share or sell it to' },
  { key: 'photos_content', title: 'Your photos, videos and posts' },
  { key: 'location', title: 'Your location' },
  { key: 'contact', title: 'Who can contact you' },
  { key: 'ads_tracking', title: 'Ads and tracking' },
  { key: 'money', title: 'Money, subscriptions and in-app purchases' },
  { key: 'delete_account', title: 'Deleting your account and data' },
  { key: 'disputes', title: 'If something goes wrong (disputes)' },
  { key: 'changes', title: 'Changing the rules later' },
];

export const TEEN_RULES = `
Decide a verdict for a 13 to 17 year old in India:

RED ("Not great for teens") if ANY of these is clearly stated:
- The service is only for adults (18+), or says minors must not use it.
- They sell personal data, or share it widely with advertisers or "partners" for their own purposes.
- They can use your photos, videos or name in ads or sell them, without asking each time.
- Strangers can freely contact or message users and the terms mention no controls for minors.
- There is no way to delete your account or data.

AMBER ("Use with care") if none of the RED points apply, but ANY of these is stated:
- Personalised ads or tracking across other apps and websites.
- A broad licence to use, copy or share what you post.
- Collecting precise location, contacts, or data from your device.
- Disputes must go to private arbitration, or to courts outside India, or you give up class actions.
- They can change the terms at any time without telling you directly.
- Automatic renewals, subscriptions or in-app purchases that are hard to cancel or refund.

GREEN ("Looks OK for teens") only if none of the RED or AMBER points apply.

Always:
- Base every point ONLY on the supplied document text. Never guess or use outside knowledge about the company.
- Every point must include an exact quote copied word-for-word from the document as proof.
- If the document does not mention a topic, leave that topic out instead of guessing.
- Write like a friendly older sibling: short, simple, casual, no legal jargon, never cringe.
- Give practical tips a teen can actually do (for example: turn off ad personalisation, make the account private, ask a parent).
`;

export const INDIA_UNDER_18_NOTE =
  "In India, if you're under 18, apps need your parent's OK before they use your personal data (Digital Personal Data Protection Act, 2023).";
