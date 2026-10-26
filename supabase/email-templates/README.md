# TickPin auth emails — setup notes

Prepared 2026-10-26 at Boss's request: the confirmation email a new member
receives must be a proper TickPin welcome email, from a TickPin identity.

## Confirm signup template

Supabase Dashboard → Authentication → Email Templates → **Confirm signup**

- **Subject:** `Welcome to TickPin — confirm your email`
- **Body:** paste `confirm-signup.html` from this folder, whole file.
- The template uses `{{ .ConfirmationURL }}` — Supabase replaces it with the
  real link. After confirming, the member lands back on tickpin.vercel.app
  already signed in (the app passes the site origin as the redirect).

## Reset password template

Supabase Dashboard → Authentication → Email Templates → **Reset password**

- **Subject:** `Reset your TickPin password`
- **Body:** paste `reset-password.html` from this folder, whole file.
- The app's flow: Log in → "Forgot your password?" → reset email → the link
  returns to tickpin.vercel.app, where the app detects the recovery session
  and shows the "Choose a new password" form. No other setup needed beyond
  the template and the project's Site URL being https://tickpin.vercel.app.

## Sender identity ("from" address)

- Supabase's built-in mailer sends from a shared Supabase address and is
  rate-limited; you cannot set a custom from-address on it.
- For mail to truly come **from TickPin** (e.g. `welcome@<tickpin domain>`),
  the project needs custom SMTP. Free route, same as TruePin uses:
  a Resend account + a verified domain, entered under
  Authentication → Settings → SMTP Settings
  (host smtp.resend.com, port 465, sender name `TickPin`).
- A TickPin sender address needs a domain TickPin owns. As of 2026-10-26
  TickPin owns none (tickpin.com is registered to someone else and dormant;
  tickpin.io appeared available). Buying a domain is Boss's decision and
  Boss's purchase — the money rule.
- Interim option: send via the already-verified truepinproperty.com domain
  with sender name `TickPin`. Works immediately, but the address reads
  @truepinproperty.com — off-brand. Switch the domain later without touching
  the templates.
