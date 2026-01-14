from __future__ import annotations

import pydantic as pdt
import typing as tp
import os
import logging
import tomllib
import types


# Explicit environment variable mappings for configuration overrides
# Each entry maps an env var name to config_path
LOWERCASE_DOTTED_MAPPINGS: tp.Mapping[str, str] = types.MappingProxyType(
    {
        "notifyhub.backend.port": "backend.port",
        "notifyhub.backend.host": "backend.host",
        "notifyhub.backend.sse_heartbeat_interval": "backend.sse_heartbeat_interval",
        "notifyhub.backend.notifications_max_count": "backend.notifications_max_count",
        "notifyhub.cli.host": "cli.host",
        "notifyhub.cli.port": "cli.port",
        "notifyhub.cli.proxy": "cli.proxy",
        "notifyhub.cli.verbose": "cli.verbose",
    }
)

UPPERCASE_UNDERSCORED_MAPPINGS: tp.Mapping[str, str] = types.MappingProxyType(
    {
        "NOTIFYHUB_BACKEND_PORT": "backend.port",
        "NOTIFYHUB_BACKEND_HOST": "backend.host",
        "NOTIFYHUB_BACKEND_SSE_HEARTBEAT_INTERVAL": "backend.sse_heartbeat_interval",
        "NOTIFYHUB_BACKEND_NOTIFICATIONS_MAX_COUNT": "backend.notifications_max_count",
        "NOTIFYHUB_CLI_HOST": "cli.host",
        "NOTIFYHUB_CLI_PORT": "cli.port",
        "NOTIFYHUB_CLI_PROXY": "cli.proxy",
        "NOTIFYHUB_CLI_VERBOSE": "cli.verbose",
    }
)


# validate_assignment=True ensures that when assigning values to model attributes
# (e.g., via setattr from env vars or config files), Pydantic validates and coerces types
# (e.g., string "8080" to int 8080) immediately, preventing invalid data and runtime errors.
# Without it, assignments bypass validation, risking type mismatches in this config-loading setup.
class NotifyHubBackendConfig(pdt.BaseModel):
    model_config = pdt.ConfigDict(validate_assignment=True)

    host: str = "0.0.0.0"
    port: int = 9080
    sse_heartbeat_interval: int = 30
    notifications_max_count: tp.Optional[int] = None


class NotifyHubCliConfig(pdt.BaseModel):
    model_config = pdt.ConfigDict(validate_assignment=True)

    host: str = "0.0.0.0"
    port: int = 9080
    proxy: str = ""
    verbose: int = 1


class NotifyHubConfig(pdt.BaseModel):
    model_config = pdt.ConfigDict(validate_assignment=True)

    backend: NotifyHubBackendConfig = pdt.Field(default_factory=NotifyHubBackendConfig)
    cli: NotifyHubCliConfig = pdt.Field(default_factory=NotifyHubCliConfig)

    @staticmethod
    def set_nested_attr(obj: tp.Any, path: str, value: tp.Any) -> None:
        """Set a nested attribute using dotted path."""
        parts = path.split(".")
        for part in parts[:-1]:
            obj = getattr(obj, part)
        setattr(obj, parts[-1], value)

    @classmethod
    def load_config(cls, cli_args: tp.Any) -> NotifyHubConfig:
        """Load configuration using ConfigStack priority layers.

        Override mappings (in priority order after code defaults):
        - notifyhub.backend.port → backend.port (int)
        - notifyhub.backend.host → backend.host (str)
        - notifyhub.backend.sse_heartbeat_interval → backend.sse_heartbeat_interval (int)
        - notifyhub.backend.notifications_max_count → backend.notifications_max_count (int or None)
        - notifyhub.cli.host → cli.host (str)
        - notifyhub.cli.port → cli.port (int)
        - notifyhub.cli.proxy → cli.proxy (str)
        - notifyhub.cli.verbose → cli.verbose (int)

        - NOTIFYHUB_BACKEND_PORT → backend.port (int)
        - NOTIFYHUB_BACKEND_HOST → backend.host (str)
        - NOTIFYHUB_BACKEND_SSE_HEARTBEAT_INTERVAL → backend.sse_heartbeat_interval (int)
        - NOTIFYHUB_BACKEND_NOTIFICATIONS_MAX_COUNT → backend.notifications_max_count (int or None)
        - NOTIFYHUB_CLI_HOST → cli.host (str)
        - NOTIFYHUB_CLI_PORT → cli.port (int)
        - NOTIFYHUB_CLI_PROXY → cli.proxy (str)
        - NOTIFYHUB_CLI_VERBOSE → cli.verbose (int)

        - --backend-port → backend.port
        - --backend-host → backend.host
        - --backend-sse-heartbeat-interval → backend.sse_heartbeat_interval
        - --backend-notifications-max-count → backend.notifications_max_count
        """
        # Layer 1: Code defaults (already handled by Pydantic model defaults)
        config = cls()

        # Layer 2: Configuration file
        config_file = os.path.expanduser("~/.config/notifyhub/config.toml")
        if os.path.exists(config_file):
            try:
                with open(config_file, "rb") as f:
                    file_config = tomllib.load(f)
                if "backend" in file_config:
                    # Update config.backend with file values
                    for key, value in file_config["backend"].items():
                        if hasattr(config.backend, key) and value is not None:
                            setattr(config.backend, key, value)
                if "cli" in file_config:
                    # Update config.cli with file values
                    for key, value in file_config["cli"].items():
                        if hasattr(config.cli, key) and value is not None:
                            setattr(config.cli, key, value)
            except Exception as e:
                logging.warning(f"Failed to load config file {config_file}: {e}")

        # Layer 3: Lowercase-dotted environment variables (notifyhub.backend.*)
        for env_key, path in LOWERCASE_DOTTED_MAPPINGS.items():
            if env_key in os.environ:
                try:
                    cls.set_nested_attr(config, path, os.environ[env_key])
                except (pdt.ValidationError, ValueError, TypeError):
                    logging.warning(
                        f"Could not set env var {env_key}='{os.environ[env_key]}' to config"
                    )

        # Layer 4: Uppercase-underscored environment variables (NOTIFYHUB_BACKEND_*)
        for env_key, path in UPPERCASE_UNDERSCORED_MAPPINGS.items():
            if env_key in os.environ:
                try:
                    cls.set_nested_attr(config, path, os.environ[env_key])
                except (pdt.ValidationError, ValueError, TypeError):
                    logging.warning(
                        f"Could not set env var {env_key}='{os.environ[env_key]}' to config"
                    )

        # Layer 5: CLI arguments (--backend.*)
        if hasattr(cli_args, "backend_port") and cli_args.backend_port is not None:
            config.backend.port = cli_args.backend_port
        if hasattr(cli_args, "backend_host") and cli_args.backend_host is not None:
            config.backend.host = cli_args.backend_host
        if (
            hasattr(cli_args, "backend_sse_heartbeat_interval")
            and cli_args.backend_sse_heartbeat_interval is not None
        ):
            config.backend.sse_heartbeat_interval = (
                cli_args.backend_sse_heartbeat_interval
            )
        if (
            hasattr(cli_args, "backend_notifications_max_count")
            and cli_args.backend_notifications_max_count is not None
        ):
            config.backend.notifications_max_count = (
                cli_args.backend_notifications_max_count
            )

        return config
