from __future__ import annotations

import pydantic as pdt
import typing as tp

from .config_stack import ConfigStack


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


class NotifyHubConfig(ConfigStack):
    app_name: tp.ClassVar[str] = "NotifyHub"
    model_config = pdt.ConfigDict(validate_assignment=True)

    backend: NotifyHubBackendConfig = pdt.Field(default_factory=NotifyHubBackendConfig)
    cli: NotifyHubCliConfig = pdt.Field(default_factory=NotifyHubCliConfig)
