---
description: Run prompt regression tests and report pass/fail
---
Run the prompt regression test suite and report results:
```bash
npx tsc && node dist/src/prompt_library/tests/run_prompt_regression.js
```

Report which prompts passed, which failed, and show any schema diffs on failures.
