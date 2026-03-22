---
description: Calculate token spend from usage ledger
---
Read the usage ledger and calculate spend:
```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('src/api_client/usage_ledger.db');
const rows = db.prepare('SELECT model, SUM(input_tokens) as input, SUM(output_tokens) as output, SUM(cache_read_tokens) as cache_read, COUNT(*) as calls FROM usage ORDER BY model').all();
console.table(rows);
db.close();
"
```

Show total tokens per model, estimated cost, and call count.
