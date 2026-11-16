# AgriConnect Release 1.0 deployment

The existing deployment uses Vercel for React, Render for the Express API, and Neon for PostgreSQL. Use a Neon branch and a Vercel preview to test the release before updating the live services.

## 1. Database and backend

1. Create a Neon branch from the current database and copy its direct PostgreSQL connection string. Render uses `DATABASE_URL` for both the schema update and the API.
2. In Render, set **Root Directory** to `backend`, **Build Command** to `npm ci --include=dev && npm run build`, and **Start Command** to `npm start`. Use Node.js 20 or later.
3. Add the backend environment variables listed below. Keep credentials in Render's environment settings.
4. Build against the Neon branch. `npm run build` generates Prisma Client, applies the schema, and installs the PostgreSQL trigger that keeps the negotiation history append-only. The build stops if Prisma requires approval for a schema change that could lose data.
5. Verify `GET /api/health` at the Render URL before configuring the frontend.

| Render variable | Value |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string with TLS enabled |
| `JWT_SECRET` | Strong random value for signing session tokens |
| `NODE_ENV` | `production` |
| `FRONTEND_ORIGIN` | HTTPS Vercel origin, with no trailing slash. Use a comma-separated list for known preview origins. |
| `CLOUDINARY_URL` | Cloudinary server credentials in the `cloudinary://...` format |
| `RAZORPAY_KEY_ID` | Razorpay **test-mode** key ID beginning with `rzp_test_` |
| `RAZORPAY_KEY_SECRET` | Secret paired with the test key |
| `RAZORPAY_WEBHOOK_SECRET` | Secret you set when registering the test webhook |
| `MARKETPLACE_TAX_PERCENT` | Optional tax percentage used for marketplace test quotes. Defaults to zero. |
| `SMTP_HOST`, `SMTP_PORT` | SMTP host and port from the provider. Use Mailtrap Email Sandbox on port `2525` for the Render free-tier demo. |
| `SMTP_USER`, `SMTP_PASS` | SMTP credentials |
| `SMTP_FROM` | From address permitted by your SMTP provider |
| `SMTP_SECURE` | Set to `true` for implicit TLS. Port `465` also enables it automatically. |
| `PASSWORD_RESET_ORIGIN` | Trusted HTTPS frontend origin used in reset links, with no path (for example, `https://agri-connect-five-pi.vercel.app`) |
| `PASSWORD_RESET_SANDBOX_EMAIL` | Optional dedicated demo account at `@example.com` with only the `BUYER` role. While using Mailtrap Sandbox, only this account can receive and use a password reset link. |

Render free web services block outbound SMTP ports 25, 465, and 587. Mailtrap Email Sandbox captures test messages in its inbox. In-app notifications work independently of SMTP. Background jobs for hold expiry, negotiation expiry, labour shortfalls, and email run while the API is awake and catch up when Render restarts. [Render free-tier limits](https://render.com/docs/free) · [Mailtrap Sandbox SMTP setup](https://docs.mailtrap.io/email-sandbox/setup/sandbox-smtp-integration)

To deliver notification and password reset emails to users, use Mailtrap Live Sending SMTP (port `2525`) with a verified sending domain and update `SMTP_FROM` to use that domain. An Email Sandbox inbox is shared test infrastructure and cannot prove ownership of a real user's email address. Reset links for the dedicated demo account stay in the sandbox. [Mailtrap Live Sending setup](https://docs.mailtrap.io/getting-started/email-api-smtp)

## 2. Frontend

In Vercel, set **Root Directory** to `frontend`, **Framework Preset** to **Vite**, **Install Command** to `npm ci --include=dev`, **Build Command** to `npm run build`, and **Output Directory** to `dist`. Set `VITE_API_URL` to your Render HTTPS URL followed by `/api`. Keep the SPA rewrite in `frontend/vercel.json` so direct links and refreshes load correctly.

## 3. Configure providers and administer accounts

- In Razorpay **Test Mode**, enable automatic capture and subscribe to `payment.captured` at `https://<render-service>/api/market/webhook`. Use the configured webhook secret. Test a checkout and confirm the paid order appears in both the farmer and vendor views. A payment captured after its stock hold has expired is flagged for manual reconciliation in the Razorpay test dashboard. [Razorpay Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps) · [Razorpay webhook verification](https://razorpay.com/docs/webhooks/validate-test)
- Configure Cloudinary before testing soil report uploads or listing photos. Allow PDF delivery in the Cloudinary product environment if it is disabled. Soil PDFs use authenticated storage. The API verifies booking ownership before streaming a report. [Cloudinary PDF delivery](https://cloudinary.com/guides/web-performance/the-developers-guide-to-pdfs) · [Cloudinary authenticated media](https://cloudinary.com/documentation/control_access_to_media)
- Register the first administrator's account through the app. From a trusted terminal, set `DATABASE_URL` to the intended environment and run `npm run admin:grant -- admin@example.com` from `backend`. Sign in with that account and use **System administration → Accreditation** to verify each center. Existing center records are retained and start as awaiting accreditation. Existing account holders must sign in again after the session upgrade.

## 4. Verify the release

Use separate test accounts for the farmer, vendor, test center, worker, buyer, and admin.

1. Sign in, switch views on a multi-role account, and open the dashboard cards.
2. Accredit a center, book a pickup at least 48 hours ahead, move it into analysis, and upload and download a PDF report.
3. List a product, add it to a farmer's cart, verify the stock cap, and place a Razorpay test order. Confirm the vendor sees it.
4. Invite a worker and accept a job. Verify overlapping dates cannot be accepted twice.
5. Reserve equipment, approve it as the owner, and view the receipt as the farmer.
6. Send and accept a produce offer, then verify the agreement and offer history on both accounts.
7. Confirm in-app notifications and check the Mailtrap inbox. Repeat the main flows on your phone.

For automated API checks, build the backend against a **disposable local PostgreSQL database** whose name includes `test`, then set `TEST_DATABASE_URL` to that same database and run `npm test` from `backend`. The tests use a simulated Razorpay gateway and local PDF storage.
