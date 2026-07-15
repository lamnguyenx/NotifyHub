import pytest
import os
import tempfile
import json
from unittest.mock import patch
import notifyhub.config as config
from confstack import confstackify


APP_NAME = "notifyhub"


class TestConfigTypeConversion:

    def test_environment_variable_string_to_int_conversion(self):
        env_vars = {
            "notifyhub.backend.port": "8080",
            "notifyhub.backend.sse_heartbeat_interval": "45",
            "notifyhub.backend.notifications_max_count": "500",
        }

        with patch.dict(os.environ, env_vars):
            result = confstackify(config.NotifyHubConfig, APP_NAME)

            assert isinstance(result.backend.port, int)
            assert result.backend.port == 8080
            assert isinstance(result.backend.sse_heartbeat_interval, int)
            assert result.backend.sse_heartbeat_interval == 45
            assert isinstance(result.backend.notifications_max_count, int)
            assert result.backend.notifications_max_count == 500

    def test_environment_variable_uppercase_conversion(self):
        env_vars = {
            "NOTIFYHUB_BACKEND_PORT": "9000",
            "NOTIFYHUB_BACKEND_SSE_HEARTBEAT_INTERVAL": "60",
        }

        with patch.dict(os.environ, env_vars):
            result = confstackify(config.NotifyHubConfig, APP_NAME)

            assert isinstance(result.backend.port, int)
            assert result.backend.port == 9000
            assert isinstance(result.backend.sse_heartbeat_interval, int)
            assert result.backend.sse_heartbeat_interval == 60

    def test_environment_variable_optional_int_none_conversion(self):
        pass

    def test_environment_variable_empty_string_raises_validation_error(self):
        env_vars = {
            "notifyhub.backend.notifications_max_count": "",
        }

        with patch.dict(os.environ, env_vars):
            with pytest.raises(Exception):
                confstackify(config.NotifyHubConfig, APP_NAME)


class TestConfigFileLoading:

    def test_config_file_int_preservation(self):
        config_data = {
            "backend": {
                "port": 8080,
                "sse_heartbeat_interval": 45,
                "notifications_max_count": 500,
            }
        }

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(config_data, f)
            config_file = f.name

        try:
            result = confstackify(
                config.NotifyHubConfig, APP_NAME, config_file=config_file
            )

            assert isinstance(result.backend.port, int)
            assert result.backend.port == 8080
            assert isinstance(result.backend.sse_heartbeat_interval, int)
            assert result.backend.sse_heartbeat_interval == 45
            assert isinstance(result.backend.notifications_max_count, int)
            assert result.backend.notifications_max_count == 500
        finally:
            os.unlink(config_file)

    def test_config_file_string_conversion(self):
        config_data = {
            "backend": {
                "port": "9090",
                "sse_heartbeat_interval": "30",
                "notifications_max_count": "100",
            }
        }

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(config_data, f)
            config_file = f.name

        try:
            result = confstackify(
                config.NotifyHubConfig, APP_NAME, config_file=config_file
            )

            assert isinstance(result.backend.port, int)
            assert result.backend.port == 9090
            assert isinstance(result.backend.sse_heartbeat_interval, int)
            assert result.backend.sse_heartbeat_interval == 30
            assert isinstance(result.backend.notifications_max_count, int)
            assert result.backend.notifications_max_count == 100
        finally:
            os.unlink(config_file)


class TestCLIArgumentHandling:

    def test_cli_args_int_assignment(self):
        overrides = {
            "backend": {
                "port": 7070,
                "host": "127.0.0.1",
                "sse_heartbeat_interval": 25,
                "notifications_max_count": 200,
            }
        }

        result = confstackify(config.NotifyHubConfig, APP_NAME, overrides=overrides)

        assert isinstance(result.backend.port, int)
        assert result.backend.port == 7070
        assert result.backend.host == "127.0.0.1"
        assert isinstance(result.backend.sse_heartbeat_interval, int)
        assert result.backend.sse_heartbeat_interval == 25
        assert isinstance(result.backend.notifications_max_count, int)
        assert result.backend.notifications_max_count == 200

    def test_overrides_none_values_dont_override_defaults(self):
        result = confstackify(config.NotifyHubConfig, APP_NAME)

        assert result.backend.port == 9080
        assert result.backend.host == "0.0.0.0"
        assert result.backend.sse_heartbeat_interval == 30
        assert result.backend.notifications_max_count is None


class TestConfigValidationErrors:

    def test_invalid_port_string_raises_validation_error(self):
        with patch.dict(os.environ, {"notifyhub.backend.port": "invalid"}):
            with pytest.raises(Exception):
                confstackify(config.NotifyHubConfig, APP_NAME)

    def test_invalid_heartbeat_string_raises_validation_error(self):
        with patch.dict(
            os.environ, {"notifyhub.backend.sse_heartbeat_interval": "not_a_number"}
        ):
            with pytest.raises(Exception):
                confstackify(config.NotifyHubConfig, APP_NAME)


class TestConfigPriorityOrder:

    def test_env_vars_override_defaults(self):
        env_vars = {
            "notifyhub.backend.port": "9999",
            "notifyhub.backend.host": "localhost",
        }

        with patch.dict(os.environ, env_vars):
            result = confstackify(config.NotifyHubConfig, APP_NAME)

            assert result.backend.port == 9999
            assert result.backend.host == "localhost"
            assert result.backend.sse_heartbeat_interval == 30
            assert result.backend.notifications_max_count is None

    def test_overrides_override_env_vars(self):
        env_vars = {
            "notifyhub.backend.port": "8888",
            "notifyhub.backend.host": "envhost",
        }

        overrides = {
            "backend": {
                "port": 7777,
                "host": "clihost",
            }
        }

        with patch.dict(os.environ, env_vars):
            result = confstackify(
                config.NotifyHubConfig, APP_NAME, overrides=overrides
            )

            assert result.backend.port == 7777
            assert result.backend.host == "clihost"
            assert result.backend.sse_heartbeat_interval == 30
            assert result.backend.notifications_max_count is None


class TestDirectAttributeAssignment:

    def test_direct_string_assignment_converts_types(self):
        backend_config = config.NotifyHubBackendConfig()

        backend_config.port = "9090"
        backend_config.sse_heartbeat_interval = "60"
        backend_config.notifications_max_count = "300"

        assert isinstance(backend_config.port, int)
        assert backend_config.port == 9090
        assert isinstance(backend_config.sse_heartbeat_interval, int)
        assert backend_config.sse_heartbeat_interval == 60
        assert isinstance(backend_config.notifications_max_count, int)
        assert backend_config.notifications_max_count == 300

    def test_direct_invalid_assignment_raises_error(self):
        backend_config = config.NotifyHubBackendConfig()

        with pytest.raises(Exception):
            backend_config.port = "not_a_number"

        with pytest.raises(Exception):
            backend_config.sse_heartbeat_interval = "invalid"

    def test_direct_none_assignment_to_optional_field(self):
        backend_config = config.NotifyHubBackendConfig()

        backend_config.notifications_max_count = None
        assert backend_config.notifications_max_count is None
