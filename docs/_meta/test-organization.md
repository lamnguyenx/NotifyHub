# Test Organization — 1-to-1 Mirror Pattern

Tests live in a top-level `tests/` directory that mirrors the `src/` package tree **exactly**. No `__tests__/` subfolders co-located with source code — tests are cleanly separated from production code.

## Rule

For every `.py` (or `.tsx`, `.js`, etc.) file under `src/<package>/`, if it needs tests, there is a corresponding test file at the equivalent path under `tests/<package>/`.

```
src/<package>/sub/module.py   →   tests/<package>/sub/test_module.py
src/<package>/sub/App.tsx      →   tests/<package>/sub/App.spec.ts
```

## Directory Shape

```
project/
├── src/
│   └── <package>/
│       ├── config.py
│       ├── services/
│       │   ├── models.py
│       │   └── api.py
│       ├── cli/
│       │   └── cli.py
│       └── web/
│           ├── App.tsx
│           └── utils.ts
└── tests/
    └── <package>/
        ├── test_config.py            ← tests for config.py
        ├── services/
        │   ├── test_models.py        ← tests for models.py
        │   └── test_api.py           ← tests for api.py
        ├── cli/
        │   └── test_cli.py           ← tests for cli.py
        └── web/
            ├── App.spec.ts           ← tests for App.tsx
            ├── utils.test.ts         ← tests for utils.ts
            └── helpers/
                └── mock_data.py
```
