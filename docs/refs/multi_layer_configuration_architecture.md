# Multi-Layer Configuration Architecture

## Configuration Priority

The configuration system uses a **layered override approach** where each layer can override values from the previous layer:

- **Layer 4 (Code Defaults)**: Provides baseline default values (lowest priority)
- **Layer 3 (Config File)**: Overrides code defaults if specified
- **Layer 2 (CLI Arguments)**: Overrides config file values if provided
- **Layer 1 (Environment Variables)**: Overrides all other layers (highest priority)

**Example:**

```
Code Default:     port = 3000
Config File:      port = 8080      → Result: 8080
CLI Argument:     --port 9000      → Result: 9000
Environment Var:  PORT=5000        → Result: 5000 (wins)
```

---

## Layer 1: Environment Variables (Highest Priority)

Environment variables provide the highest priority configuration layer.

**Mapping Rules:**

- Convert to lowercase
- Replace `__` with `.`

**Python Implementation:**

```python
lambda x: x.lower().replace('__', '.')
```

### Mapping Examples

| Environment Variable         | Internal Config Path                     |
| ---------------------------- | ---------------------------------------- |
| `PORT`                       | `Config_Object.port`                     |
| `HOST`                       | `Config_Object.host`                     |
| `DATABASE__URL`              | `Config_Object.database.url`             |
| `DATABASE__PORT`             | `Config_Object.database.port`            |
| `DATABASE__MAX__CONNECTIONS` | `Config_Object.database.max.connections` |
| `CACHE__ENABLED`             | `Config_Object.cache.enabled`            |
| `CACHE__TTL`                 | `Config_Object.cache.ttl`                |
| `CACHE__REDIS__HOST`         | `Config_Object.cache.redis.host`         |
| `API__RATE__LIMIT`           | `Config_Object.api.rate.limit`           |
| `API__TIMEOUT`               | `Config_Object.api.timeout`              |

## Layer 2: Command Line Arguments

CLI arguments are overridden by environment variables and map directly to internal config paths using dot notation.

### Mapping Examples

| CLI Argument                 | Internal Config Path                     |
| ---------------------------- | ---------------------------------------- |
| `--port`                     | `Config_Object.port`                     |
| `--host`                     | `Config_Object.host`                     |
| `--database.url`             | `Config_Object.database.url`             |
| `--database.port`            | `Config_Object.database.port`            |
| `--database.max.connections` | `Config_Object.database.max.connections` |
| `--cache.enabled`            | `Config_Object.cache.enabled`            |
| `--cache.ttl`                | `Config_Object.cache.ttl`                |
| `--cache.redis.host`         | `Config_Object.cache.redis.host`         |
| `--api.rate.limit`           | `Config_Object.api.rate.limit`           |
| `--api.timeout`              | `Config_Object.api.timeout`              |

## Layer 3: Configuration File

Configuration files (e.g., TOML) are overridden by CLI arguments and map directly to internal config paths using dot notation.

### Mapping Examples

| TOML Key                   | Internal Config Path                     |
| -------------------------- | ---------------------------------------- |
| `port`                     | `Config_Object.port`                     |
| `host`                     | `Config_Object.host`                     |
| `database.url`             | `Config_Object.database.url`             |
| `database.port`            | `Config_Object.database.port`            |
| `database.max.connections` | `Config_Object.database.max.connections` |
| `cache.enabled`            | `Config_Object.cache.enabled`            |
| `cache.ttl`                | `Config_Object.cache.ttl`                |
| `cache.redis.host`         | `Config_Object.cache.redis.host`         |
| `api.rate.limit`           | `Config_Object.api.rate.limit`           |
| `api.timeout`              | `Config_Object.api.timeout`              |

### TOML Configuration File

```toml
port = 8080
host = "localhost"

[database]
url = "postgresql://localhost/mydb"
port = 5432

[database.max]
connections = 100

[cache]
enabled = true
ttl = 3600

[cache.redis]
host = "localhost"

[api]
timeout = 30

[api.rate]
limit = 100
```

## Layer 4: Code Configuration Model (Lowest Priority)

The final layer defines the configuration structure with default values.

### Python Implementation

```python
class Config(pydantic.BaseModel):
    port: int = PORT__DEFAULT
    host: str = HOST__DEFAULT

    class Database(pydantic.BaseModel):
        url: str = DATABASE__URL__DEFAULT
        port: int = DATABASE__PORT__DEFAULT

        class Max(pydantic.BaseModel):
            connections: int = DATABASE__MAX__CONNECTIONS__DEFAULT

        max: Max = Max()

    database: Database = Database()

    class Cache(pydantic.BaseModel):
        enabled: bool = CACHE__ENABLED__DEFAULT
        ttl: int = CACHE__TTL__DEFAULT

        class Redis(pydantic.BaseModel):
            host: str = CACHE__REDIS__HOST__DEFAULT

        redis: Redis = Redis()

    cache: Cache = Cache()

    class Api(pydantic.BaseModel):
        timeout: int = API__TIMEOUT__DEFAULT

        class Rate(pydantic.BaseModel):
            limit: int = API__RATE__LIMIT__DEFAULT

        rate: Rate = Rate()

    api: Api = Api()
```

### TypeScript Implementation

```typescript
interface Config {
  port: number;
  host: string;

  database: Config.Database;
  cache: Config.Cache;
  api: Config.Api;
}

namespace Config {
  export interface Database {
    url: string;
    port: number;
    max: Database.Max;
  }

  export namespace Database {
    export interface Max {
      connections: number;
    }
  }

  export interface Cache {
    enabled: boolean;
    ttl: number;
    redis: Cache.Redis;
  }

  export namespace Cache {
    export interface Redis {
      host: string;
    }
  }

  export interface Api {
    timeout: number;
    rate: Api.Rate;
  }

  export namespace Api {
    export interface Rate {
      limit: number;
    }
  }
}

const defaultConfig: Config = {
  port: PORT__DEFAULT,
  host: HOST__DEFAULT,
  database: {
    url: DATABASE__URL__DEFAULT,
    port: DATABASE__PORT__DEFAULT,
    max: {
      connections: DATABASE__MAX__CONNECTIONS__DEFAULT,
    },
  },
  cache: {
    enabled: CACHE__ENABLED__DEFAULT,
    ttl: CACHE__TTL__DEFAULT,
    redis: {
      host: CACHE__REDIS__HOST__DEFAULT,
    },
  },
  api: {
    timeout: API__TIMEOUT__DEFAULT,
    rate: {
      limit: API__RATE__LIMIT__DEFAULT,
    },
  },
};
```
