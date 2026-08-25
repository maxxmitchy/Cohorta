# Cohorta

**Find your people. Learn your thing.**

Cohorta is an intelligent discovery and learning platform for live learning communities. It adds an intelligence layer on top of real-time communication platforms (like Telegram) to help users find, join, and catch up with active learning cohorts.

## Architecture

Cohorta strictly follows a Domain-Driven Layered Architecture to ensure the application remains modular, scalable, and testable as it grows into a complex marketplace.

### Directory Structure

```text
src/
├── core/
│   ├── domain/         # Canonical Domain Entities (Community, User, Membership)
│   ├── dto/            # Data Transfer Objects strictly for UI rendering
│   ├── repositories/   # Interfaces defining persistence contracts
│   └── services/       # Application use-cases (Ranking, Discovery, AI Orchestration)
├── infrastructure/
│   ├── db/             # Persistence implementations (Mock, later PostgreSQL/Firebase)
│   └── integrations/   # External provider wrappers (TelegramBot, Stripe)
├── ui/
│   ├── components/     # Dumb React presentation components
│   ├── pages/          # React route entries
│   └── hooks/          # UI-specific state handling
└── lib/                # Shared stateless utilities (Tailwind cn)
```

### 1. Domain Model
The core domain is strictly typed and decoupled from both the database and the UI.
- `Community`: The core identity. Stripped of pricing and integration details.
- `MembershipPlan`: Handles the financial abstraction (Free, Subscription).
- `CommunityIntegration`: The provider abstraction (e.g., Telegram).
- `CommunityMetrics`: Decoupled stats (growth, active users) optimized for fast reading.

### 2. Persistence Architecture
React components **do not** talk to the database directly. We use the Repository pattern. 
Currently, the app relies on `MockCommunityRepository` injected into the Application Services. When we move to production, we will write a `PostgresCommunityRepository` or `FirebaseCommunityRepository` that satisfies the exact same interface, requiring **zero** changes to the UI layer.

### 3. Integration Architecture (Telegram)
Telegram is modeled as a *Provider*. It is not hardcoded into the core identity of a Community. This allows us to theoretically support Discord or native messaging in the future.

### 4. Development & Build
The application is built with React 19, Vite, and Tailwind CSS v4.

```bash
# Start development server
npm run dev

# Build for production
npm run build
```

### 5. Testing
Business logic (`src/core/services`) is tested using `vitest`. The UI remains primarily tested manually or via end-to-end tools in the future.

### 6. Current Limitations
- **Mock Data Layer**: The database is currently simulated via memory arrays (`mockData.ts`).
- **No Real Auth**: Authentication flows are skeletal placeholders.
- **No AI Processing**: The `AIAssistantService` boundary exists conceptually but is not yet wired to Gemini.

### 7. Future Phases
1. **Community Detail & Roadmap UX**: Visualizing the learning timeline.
2. **AI Catch Me Up**: Hooking up the timeline to Gemini via `@google/genai`.
3. **Database Migration**: Replacing `MockCommunityRepository` with a real provider.
4. **Creator Dashboard**: Enabling community owners to import their Telegram groups.
