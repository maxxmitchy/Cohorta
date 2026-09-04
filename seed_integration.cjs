const fs = require('fs');
const path = require('path');
const dir = path.join(process.cwd(), '.data');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

const integrations = {
  integrations: {
    "telegram:-5456731754": {
      communityId: "comm_test_123",
      providerType: "telegram",
      providerCommunityId: "-5456731754",
      addedAt: new Date().toISOString(),
      isActive: true,
      lastCheckpoint: 0
    }
  }
};

const history = {
  discussions: {},
  topics: {}
};

fs.writeFileSync(path.join(dir, 'community_integrations.json'), JSON.stringify(integrations, null, 2));
fs.writeFileSync(path.join(dir, 'community_history.json'), JSON.stringify(history, null, 2));
fs.writeFileSync(path.join(dir, 'ingestion_events.json'), JSON.stringify({ events: {} }, null, 2));

console.log("Seeded .data/");
