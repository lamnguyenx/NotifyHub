from __future__ import annotations

import pydantic as pdt
import typing as tp


class NotifyHubBackendConfig(pdt.BaseModel):
    model_config = pdt.ConfigDict(validate_assignment=True)

    host: str = pdt.Field("0.0.0.0", description="Host to bind server to")
    port: int = pdt.Field(9080, description="Port to run server on")
    sse_heartbeat_interval: int = pdt.Field(
        30, description="SSE heartbeat interval in seconds"
    )
    notifications_max_count: tp.Optional[int] = pdt.Field(
        None,
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


class NotifyHubCliConfig(pdt.BaseModel):
    model_config = pdt.ConfigDict(validate_assignment=True)

    host: str = "0.0.0.0"
    port: int = 9080
    proxy: str = ""
    verbose: bool = False
    message: str = ""

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


class NotifyHubConfig(pdt.BaseModel):

    backend: NotifyHubBackendConfig = pdt.Field(
        default_factory=lambda: NotifyHubBackendConfig()
    )
    cli: NotifyHubCliConfig = pdt.Field(default_factory=lambda: NotifyHubCliConfig())
