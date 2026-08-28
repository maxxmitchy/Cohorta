# Cohorta

**Find your people. Learn your thing.**

Cohorta is an intelligent discovery and learning platform for live learning communities. It adds an intelligence layer on top of real-time communication platforms (like Telegram) to help users find, join, and catch up with active learning cohorts.

## Architecture

Cohorta strictly follows a Domain-Driven Layered Architecture with CQRS-inspired read models to ensure the application remains modular, scalable, and testable as it grows into a complex marketplace.

### Directory Structure

```text
src/
├── core/
│   ├── domain/         # Canonical Domain Entities (Community, User, Membership)
│   ├── readmodels/     # Flattened Read Models strictly for UI rendering (e.g. DiscoveryFeed)
│   ├── repositories/   # Interfaces defining persistence contracts (Command & Query)
│   └── services/       # Application use-cases (Ranking, Discovery)
├── infrastructure/
│   ├── db/             # Persistence implementations (Mock, later PostgreSQL/Firebase)
│   ├── di/             # Dependency Injection definitions
│   └── integrations/   # External provider wrappers (TelegramBot, Stripe)
├── ui/
│   ├── components/     # Dumb React presentation components
│   ├── context/        # React Contexts (e.g. ServiceProvider for DI)
│   ├── pages/          # React route entries
│   └── hooks/          # UI-specific state handling
└── lib/                # Shared stateless utilities (Tailwind cn)
```

### 1. Domain Model
The core domain is strictly typed and decoupled from both the database and the UI.
- `Community`: The core identity. Stripped of pricing and integration details.
- `MembershipPlan`: Handles the financial abstraction (Free, Subscription, One-Time).
- `CommunityIntegration`: The provider abstraction (e.g., Telegram).
- `CommunityStats`: Decoupled engagement stats optimized for fast reading.

### 2. Persistence Architecture & Read Models
React components **do not** talk to the database directly, nor do they instantiate their own dependencies. 
- We use the Repository pattern, separated into Query and Command responsibilities. 
- `IDiscoveryQueryRepository` returns flat `CommunityDiscoveryReadModel` objects to prevent N+1 queries.
- Dependencies are injected via a React `ServiceContext` Composition Root (`useServices()`).

### 3. Ranking Model
Ranking logic is isolated in a Strategy pattern (`IRankingStrategy`) inside `RankingService`. The current implementation (`ProvisionalTrendingStrategy`) uses a simple weighted average, but the architecture explicitly accommodates future signals (growth velocity, engagement, retention, satisfaction).

### 4. Integration Architecture (Telegram)
Telegram is modeled strictly as a *Provider*. It is not hardcoded into the core identity of a Community. This allows us to support Discord or native messaging in the future.

#### Inbound Webhook Pipeline (Phase 13.2)
```text
Telegram Cloud (Bot API)
        ↓ POST /api/webhooks/telegram (X-Telegram-Bot-Api-Secret-Token)
TelegramWebhookHandler
  ├─ Constant-time secret token verification (TELEGRAM_WEBHOOK_SECRET)
  ├─ Runtime schema payload validation (TelegramPayloadValidator)
  └─ In-Memory Deduplication (transient idempotency boundary)
        ↓
TelegramSourceAdapter (Authoritative Provider Boundary)
  ├─ Enforces authorizedChatIds fail-closed boundary
  ├─ Drops private /start messages
  └─ Extracts resources & provenance
        ↓
ExternalCommunitySourceEvent
        ↓
CommunityHistoryNormalizer
        ↓
Discussion / DiscussionReply / DiscussionResource Read Models
```

- **Server-Side Boundary**: Inbound webhook processing runs on a Node/Express backend (`server.ts`). Secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`) never enter the client or browser bundle.
- **Fail-Closed Security**: Webhook requests missing the `X-Telegram-Bot-Api-Secret-Token` header or presenting invalid tokens return `401 Unauthorized`.
- **Manual Webhook Setup**: Telegram `setWebhook` is an explicit CLI command (`npm run telegram:set-webhook`) and is NEVER invoked automatically on application startup or in automated tests.
- **Persistence Boundary**: In-memory deduplication and transient normalization are used in Phase 13.2; persistent storage / queue is the future insertion point.

### 5. Development & Build
The application runs as a full-stack Node.js + Vite + React 19 architecture styled with Tailwind CSS v4.

```bash
# Start full-stack development server
npm run dev

# Build for production
npm run build

# Run unit and integration tests
npx vitest run

# Register Telegram Webhook (explicit CLI operation)
npm run telegram:set-webhook -- --url=https://your-public-url.run.app/api/webhooks/telegram --secret=your_webhook_secret
```

### 6. Current Limitations
- **Mock Data Layer**: The database is currently simulated via memory arrays (`mockData.ts`).
- **No Real Auth**: Authentication flows are skeletal placeholders.
- **No AI Processing**: The `AIAssistantService` boundary exists conceptually but is not yet wired to Gemini.

### 7. Future Phases
1. **Community Detail & Roadmap UX**: Visualizing the learning timeline.
2. **AI Catch Me Up**: Hooking up the timeline to Gemini via `@google/genai`.
3. **Database Migration**: Replacing `MockDiscoveryQueryRepository` with a real provider.
4. **Creator Dashboard**: Enabling community owners to import their Telegram groups.
