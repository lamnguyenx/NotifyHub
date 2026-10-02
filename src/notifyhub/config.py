from __future__ import annotations

import pydantic as pdt
import typing as tp

from booleanify import booleanify


class NotifyHubBackendConfig(pdt.BaseModel):
    model_config = pdt.ConfigDict(validate_assignment=True)

    host: str = pdt.Field("0.0.0.0", description="Host to bind server to")
    port: int = pdt.Field(9080, description="Port to run server on")
    sse_heartbeat_interval: int = pdt.Field(
        30, description="SSE heartbeat interval in seconds"
    )
    notifications_max_count: tp.Optional[int] = pdt.Field(
        1000,
        description="Maximum number of notifications to store (None for unlimited)",
    )
    telegram_chat_id: str = pdt.Field(
        "",
        description="Telegram chat ID to send notifications to (empty = disabled)",
    )
    telegram_group_chat_id: str = pdt.Field(
        "",
        description="Telegram group chat ID to send notifications to (empty = disabled)",
    )
    telegram_notify_tags: tp.List[str] = pdt.Field(
        default_factory=list,
        description="Only send Telegram notifications for messages containing these tags (empty = send all)",
    )
    macos_notifications_enabled: bool = pdt.Field(
        True,
        description="Push notifications to macOS Notification Center (requires macOS)",
    )
    bark_device_key: str = pdt.Field(
        "",
        description="Bark device key for iOS push notifications (empty = disabled)",
    )
    bark_notify_tags: tp.List[str] = pdt.Field(
        default_factory=list,
        description="Only send Bark notifications for messages containing these tags (empty = send all)",
    )

    dev_reload: bool = pdt.Field(
        False,
        description="Enable uvicorn auto-reload with code watching (dev mode)",
    )


class NotifyHubCliConfig(pdt.BaseModel):
    model_config = pdt.ConfigDict(validate_assignment=True)

    host: str = "0.0.0.0"
    port: int = 9080
    proxy: str = ""
    verbose: bool = False
    message: str = ""
    enabled: bool = True

    @pdt.field_validator("enabled", mode="before")
    @classmethod
    def _parse_enabled(cls, value: tp.Any) -> tp.Any:
        # Exported-empty (NOTIFYHUB_CLI_ENABLED="") means "unset" → default (enabled);
        # everything else must be booleanify-compatible ("t", "yes", "0", …).
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return True
            if stripped == "0":
                # booleanify's README documents '0' → False but its table only maps
                # the integer 0 (upstream gap), so normalize it here.
                return False
            return booleanify(stripped)
        return value

    @pdt.computed_field
    @property
    def address(self) -> str:
        return f"http://{self.host}:{self.port}"

    def get_message(self, message_args: tp.Optional[tp.List[str]] = None) -> str:
        import sys

        if self.message:
            return self.message
        if message_args:
            return " ".join(message_args)
        return sys.stdin.read().strip() or "HOST_ID (opencode)"


class NotifyHubOpencodePluginConfig(pdt.BaseModel):
    model_config = pdt.ConfigDict(validate_assignment=True)

    muted_agents: tp.List[str] = pdt.Field(
        default_factory=lambda: ["empty"],
        description=(
            "OpenCode agent names whose sessions never send notifications "
            "(e.g. the Midscene AndroidWorld benchmark uses the 'empty' agent "
            "for raw model calls); empty = notify for every agent"
        ),
    )

    @pdt.field_validator("muted_agents", mode="before")
    @classmethod
    def _parse_muted_agents(cls, value: tp.Any) -> tp.Any:
        # Accept a comma-separated env var (NOTIFYHUB_PLUGINS_OPENCODE_MUTED_AGENTS);
        # confstack passes env values as raw strings, unlike file/CLI lists.
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


class NotifyHubPluginsConfig(pdt.BaseModel):
    model_config = pdt.ConfigDict(validate_assignment=True)

    opencode: NotifyHubOpencodePluginConfig = pdt.Field(
        default_factory=NotifyHubOpencodePluginConfig
    )


class NotifyHubConfig(pdt.BaseModel):

    backend: NotifyHubBackendConfig = pdt.Field(
        default_factory=lambda: NotifyHubBackendConfig()
    )
    cli: NotifyHubCliConfig = pdt.Field(default_factory=lambda: NotifyHubCliConfig())
    plugins: NotifyHubPluginsConfig = pdt.Field(
        default_factory=NotifyHubPluginsConfig
    )
