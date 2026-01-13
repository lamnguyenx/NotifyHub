import pytest
import os
import tempfile
from unittest.mock import patch, MagicMock
import notifyhub.config as config


class TestConfigTypeConversion:

    def test_environment_variable_string_to_int_conversion(self):
        """Test that string values from environment variables are converted to int."""
        # Test lowercase-dotted format
        env_vars = {
            "notifyhub.backend.port": "8080",
            "notifyhub.backend.sse_heartbeat_interval": "45",
            "notifyhub.backend.notifications_max_count": "500",
        }

        with patch.dict(os.environ, env_vars):
            cli_args = MagicMock()
            # Set CLI args to None so they don't override env vars
            cli_args.backend_port = None
            cli_args.backend_host = None
            cli_args.backend_sse_heartbeat_interval = None
            cli_args.backend_notifications_max_count = None
            result = config.NotifyHubConfig.load_config(cli_args)

            assert isinstance(result.backend.port, int)
            assert result.backend.port == 8080
            assert isinstance(result.backend.sse_heartbeat_interval, int)
            assert result.backend.sse_heartbeat_interval == 45
            assert isinstance(result.backend.notifications_max_count, int)
            assert result.backend.notifications_max_count == 500

    def test_environment_variable_uppercase_conversion(self):
        """Test that uppercase-underscored environment variables are converted."""
        env_vars = {
            "NOTIFYHUB_BACKEND_PORT": "9000",
            "NOTIFYHUB_BACKEND_SSE_HEARTBEAT_INTERVAL": "60",
        }

        with patch.dict(os.environ, env_vars):
            cli_args = MagicMock()
            # Set CLI args to None so they don't override env vars
            cli_args.backend_port = None
            cli_args.backend_host = None
            cli_args.backend_sse_heartbeat_interval = None
            cli_args.backend_notifications_max_count = None
            result = config.NotifyHubConfig.load_config(cli_args)

            assert isinstance(result.backend.port, int)
            assert result.backend.port == 9000
            assert isinstance(result.backend.sse_heartbeat_interval, int)
            assert result.backend.sse_heartbeat_interval == 60

    def test_environment_variable_optional_int_none_conversion(self):
        """Test that None string is properly handled for optional int fields."""
        # Environment variables are always strings, so we can't test None directly
        # This test is not valid - env vars can't be None
        pass

    def test_environment_variable_empty_string_to_none(self):
        """Test that empty string for optional field becomes None."""
        env_vars = {
            "notifyhub.backend.notifications_max_count": "",
        }

        with patch.dict(os.environ, env_vars):
            cli_args = MagicMock()
            # Set CLI args to None so they don't override env vars
            cli_args.backend_port = None
            cli_args.backend_host = None
            cli_args.backend_sse_heartbeat_interval = None
            cli_args.backend_notifications_max_count = None
            result = config.NotifyHubConfig.load_config(cli_args)

            # Empty string should become None for optional int
            assert result.backend.notifications_max_count is None


class TestConfigFileLoading:

    def test_config_file_int_preservation(self):
        """Test that int values from config file are preserved."""
        config_data = """
[backend]
port = 8080
sse_heartbeat_interval = 45
notifications_max_count = 500
"""

        with tempfile.NamedTemporaryFile(mode='w', suffix='.toml', delete=False) as f:
            f.write(config_data)
            config_file = f.name

        try:
            with patch('os.path.expanduser', return_value=config_file):
                cli_args = MagicMock()
                # Set CLI args to None so they don't override config file
                cli_args.backend_port = None
                cli_args.backend_host = None
                cli_args.backend_sse_heartbeat_interval = None
                cli_args.backend_notifications_max_count = None
                result = config.NotifyHubConfig.load_config(cli_args)

                assert isinstance(result.backend.port, int)
                assert result.backend.port == 8080
                assert isinstance(result.backend.sse_heartbeat_interval, int)
                assert result.backend.sse_heartbeat_interval == 45
                assert isinstance(result.backend.notifications_max_count, int)
                assert result.backend.notifications_max_count == 500
        finally:
            os.unlink(config_file)

    def test_config_file_string_conversion(self):
        """Test that string values from config file are converted to int."""
        config_data = """
[backend]
port = "9090"
sse_heartbeat_interval = "30"
notifications_max_count = "100"
"""

        with tempfile.NamedTemporaryFile(mode='w', suffix='.toml', delete=False) as f:
            f.write(config_data)
            config_file = f.name

        try:
            with patch('os.path.expanduser', return_value=config_file):
                cli_args = MagicMock()
                # Set CLI args to None so they don't override config file
                cli_args.backend_port = None
                cli_args.backend_host = None
                cli_args.backend_sse_heartbeat_interval = None
                cli_args.backend_notifications_max_count = None
                result = config.NotifyHubConfig.load_config(cli_args)

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
        """Test that CLI args are properly assigned and typed."""
        cli_args = MagicMock()
        cli_args.backend_port = 7070
        cli_args.backend_host = "127.0.0.1"
        cli_args.backend_sse_heartbeat_interval = 25
        cli_args.backend_notifications_max_count = 200

        result = config.NotifyHubConfig.load_config(cli_args)

        assert isinstance(result.backend.port, int)
        assert result.backend.port == 7070
        assert result.backend.host == "127.0.0.1"
        assert isinstance(result.backend.sse_heartbeat_interval, int)
        assert result.backend.sse_heartbeat_interval == 25
        assert isinstance(result.backend.notifications_max_count, int)
        assert result.backend.notifications_max_count == 200

    def test_cli_args_none_handling(self):
        """Test that None CLI args don't override defaults."""
        cli_args = MagicMock()
        cli_args.backend_port = None
        cli_args.backend_host = None
        cli_args.backend_sse_heartbeat_interval = None
        cli_args.backend_notifications_max_count = None

        result = config.NotifyHubConfig.load_config(cli_args)

        assert result.backend.port == 9080  # default
        assert result.backend.host == "0.0.0.0"  # default
        assert result.backend.sse_heartbeat_interval == 30  # default
        assert result.backend.notifications_max_count is None  # default


class TestConfigValidationErrors:

    def test_invalid_port_string_raises_validation_error(self):
        """Test that invalid string for port raises ValidationError."""
        cli_args = MagicMock()

        with patch.dict(os.environ, {"notifyhub.backend.port": "invalid"}):
            with pytest.raises(Exception):  # Should raise ValidationError
                config.NotifyHubConfig.load_config(cli_args)

    def test_invalid_heartbeat_string_raises_validation_error(self):
        """Test that invalid string for heartbeat interval raises ValidationError."""
        cli_args = MagicMock()

        with patch.dict(os.environ, {"notifyhub.backend.sse_heartbeat_interval": "not_a_number"}):
            with pytest.raises(Exception):  # Should raise ValidationError
                config.NotifyHubConfig.load_config(cli_args)


class TestConfigPriorityOrder:

    def test_env_vars_override_defaults(self):
        """Test that environment variables override defaults."""
        env_vars = {
            "notifyhub.backend.port": "9999",
            "notifyhub.backend.host": "localhost",
        }

        with patch.dict(os.environ, env_vars):
            cli_args = MagicMock()
            # Set CLI args to None so they don't override env vars
            cli_args.backend_port = None
            cli_args.backend_host = None
            cli_args.backend_sse_heartbeat_interval = None
            cli_args.backend_notifications_max_count = None
            result = config.NotifyHubConfig.load_config(cli_args)

            assert result.backend.port == 9999
            assert result.backend.host == "localhost"
            assert result.backend.sse_heartbeat_interval == 30  # default
            assert result.backend.notifications_max_count is None  # default

    def test_cli_args_override_env_vars(self):
        """Test that CLI args override environment variables."""
        env_vars = {
            "notifyhub.backend.port": "8888",
            "notifyhub.backend.host": "envhost",
        }

        cli_args = MagicMock()
        cli_args.backend_port = 7777
        cli_args.backend_host = "clihost"
        cli_args.backend_sse_heartbeat_interval = None
        cli_args.backend_notifications_max_count = None

        with patch.dict(os.environ, env_vars):
            result = config.NotifyHubConfig.load_config(cli_args)

            assert result.backend.port == 7777  # CLI overrides env
            assert result.backend.host == "clihost"  # CLI overrides env
            assert result.backend.sse_heartbeat_interval == 30  # default
            assert result.backend.notifications_max_count is None  # default


class TestDirectAttributeAssignment:

    def test_direct_string_assignment_converts_types(self):
        """Test that direct assignment to model attributes converts types."""
        backend_config = config.NotifyHubBackendConfig()

        # These should work and convert types
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
        """Test that direct assignment of invalid values raises ValidationError."""
        backend_config = config.NotifyHubBackendConfig()

        with pytest.raises(Exception):  # Should raise ValidationError
            backend_config.port = "not_a_number"

        with pytest.raises(Exception):  # Should raise ValidationError
            backend_config.sse_heartbeat_interval = "invalid"

    def test_direct_none_assignment_to_optional_field(self):
        """Test that None can be assigned to optional fields."""
        backend_config = config.NotifyHubBackendConfig()

        backend_config.notifications_max_count = None
        assert backend_config.notifications_max_count is None