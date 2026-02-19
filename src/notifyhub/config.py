from __future__ import annotations

import pydantic as pdt
import typing as tp

from confstack import ConfStack


# validate_assignment=True ensures that when assigning values to model attributes
# (e.g., via setattr from env vars or config files), Pydantic validates and coerces types
# (e.g., string "8080" to int 8080) immediately, preventing invalid data and runtime errors.
# Without it, assignments bypass validation, risking type mismatches in this config-loading setup.
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


class NotifyHubCliConfig(pdt.BaseModel):
    model_config = pdt.ConfigDict(validate_assignment=True)

    host: str = "0.0.0.0"
    port: int = 9080
    proxy: str = ""
    verbose: int = 0
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


class NotifyHubConfig(ConfStack):
    app_name: tp.ClassVar[str] = "notifyhub"
    model_config = pdt.ConfigDict(validate_assignment=True)

    backend: NotifyHubBackendConfig = pdt.Field(
        default_factory=lambda: NotifyHubBackendConfig()
    )
    cli: NotifyHubCliConfig = pdt.Field(default_factory=lambda: NotifyHubCliConfig())
