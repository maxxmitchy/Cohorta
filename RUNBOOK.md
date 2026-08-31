# Cohorta Production Runbook

## A. Production Architecture
Cohorta operates as a Node.js Express full-stack application. In production, the server (`dist/server.cjs`) is responsible for serving both the static Vite frontend client and handling dynamic `/api` requests, including the Telegram Webhook ingestion boundary. The application should be placed behind an HTTPS reverse proxy or load balancer.

The server leverages file-based durable storage located in the `.data/` directory (created automatically). **Persistent disk is strictly required** to preserve ingestion events and community history across container restarts.

## B. Environment Contract

### Required Secrets
* `TELEGRAM_BOT_TOKEN` - The secret token for bot API access. (Must NEVER be exposed to frontend/Vite)
* `TELEGRAM_WEBHOOK_SECRET` - The secret token provided to Telegram to authenticate incoming webhooks. (Must NEVER be exposed to frontend/Vite)

### Required Non-Secret Configuration
* `TELEGRAM_ALLOWED_CHAT_IDS` - A comma-separated list of numeric Telegram Chat IDs authorized to ingest events.
* `TELEGRAM_WEBHOOK_URL` - The public HTTPS URL terminating at your Cohorta instance's `/api/webhooks/telegram` endpoint.

### Optional Configuration
* `TELEGRAM_API_BASE_URL` - (Defaults to `https://api.telegram.org`).

*Note: None of these variables should use the `VITE_` prefix to ensure strict boundary enforcement between server secrets and the browser.*

## C. Webhook Lifecycle
Webhook registration is intentionally separated from server startup. The complete manual lifecycle is:

1. **Deployment**: Deploy the Node.js server. Ensure `.data/` is backed by a persistent volume.
2. **Environment configuration**: Apply the environment variables using your cloud provider's secret manager.
3. **Readiness Check**: Validate structural readiness without mutating state.
   ```bash
   npm run telegram:readiness
   ```
4. **Webhook Registration**: Authenticate and register the webhook with Telegram manually.
   ```bash
   npm run telegram:set-webhook
   ```
5. **Ingestion**: Telegram delivers POST requests to `/api/webhooks/telegram`. The payload is authenticated using `X-Telegram-Bot-Api-Secret-Token`.
6. **Observability**: Monitor integration health.
7. **Webhook Deletion**: Remove the webhook when necessary.
   ```bash
   npm run telegram:delete-webhook
   ```

## D. Operational CLI Commands
The following CLI commands are provided for operator control:

| Command | Mutates external state? | Mutates local state? | Requires secrets? | Safe to rerun? | Logs secrets? |
| ------- | ----------------------- | -------------------- | ----------------- | -------------- | ------------- |
| `npm run telegram:readiness` | No | No | Yes (Read-only) | Yes | No |
| `npm run telegram:webhook-info`| No | No | Yes (Read-only) | Yes | No |
| `npm run telegram:set-webhook` | Yes (Telegram API) | No | Yes | Yes | No |
| `npm run telegram:delete-webhook`| Yes (Telegram API)| No | Yes | Yes | No |

## E. Persistence Requirements
**Yes, persistent disk is mandatory.** The application writes durable events atomically to the `.data/` directory. If deployed to ephemeral storage (like a stateless cloud container without a mounted volume), all ingestion histories and integration mappings will be lost upon restart.

## F. Security & Secret Exposure
- Canonical environment validation ensures startup checks never log secrets.
- `setWebhook` strips query parameters and URL fragments prior to logging to prevent path-based credential leaks.
- All errors gracefully omit the raw payload secrets.
- Unauthenticated requests to the webhook boundary yield `401 Unauthorized`.

## G. Reverse Proxy / HTTPS Boundary
- The Express server relies on `trust proxy: 1` to parse incoming proxy headers natively.
- Telegram enforces that the webhook endpoint operates over `https://`.
- TLS termination typically occurs at your load balancer or reverse proxy, with traffic internally routed to Cohorta on HTTP port 3000.

## H. Failure Matrix
- **Missing / Malformed Config**: `readinessCheck` reports `NOT READY`. Operations like `setWebhook` fail instantly with sanitized outputs.
- **Missing Secret Header**: Inbound requests failing the `X-Telegram-Bot-Api-Secret-Token` validation fail instantly with `401 Unauthorized` without performing disk writes.
- **Unauthorized Chat**: Payload is structurally valid but the chat ID is not inside `TELEGRAM_ALLOWED_CHAT_IDS`. The system safely rejects the payload and logs unauthorized access, protecting tenant borders.
- **Disk Write Failure**: If the persistent volume is full or unavailable, `DurableFileStorage` will bubble the error, resulting in a `500` to Telegram (which prompts Telegram to retry with backoff).
- **Restart During Ingestion**: Concurrent requests are atomically buffered via write-queues, preventing file corruption.

## I. Local Verification Mode
You can locally verify routing, config, and parsing via standard Vitest unit tests without providing real credentials. All tests use strict mocks for HTTP bounds.

To verify readiness safely (expect `NOT READY` if unconfigured):
```bash
npm run telegram:readiness
```
