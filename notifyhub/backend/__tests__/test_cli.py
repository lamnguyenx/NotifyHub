import pytest
import sys
from io import StringIO
from unittest.mock import patch, MagicMock
import notifyhub.cli


class TestCLIArgumentParsing:
    def test_default_port(self):
        with patch('sys.argv', ['notifyhub-push', '{"message": "test message"}']):
            with patch('notifyhub.cli.requests.post') as mock_post:
                mock_response = MagicMock()
                mock_response.json.return_value = {"success": True}
                mock_post.return_value = mock_response

                with patch('sys.exit') as mock_exit:
                    notifyhub.cli.main()

                    # Should have called requests.post with default port 9080
                    mock_post.assert_called_once()
                    args, kwargs = mock_post.call_args
                    assert 'http://localhost:9080/api/notify' == args[0]

    def test_custom_port(self):
        with patch('sys.argv', ['notifyhub-push', '--port', '9999', '{"message": "test message"}']):
            with patch('notifyhub.cli.requests.post') as mock_post:
                mock_response = MagicMock()
                mock_response.json.return_value = {"success": True}
                mock_post.return_value = mock_response

                with patch('sys.exit') as mock_exit:
                    notifyhub.cli.main()

                    # Should have called requests.post with custom port
                    mock_post.assert_called_once()
                    args, kwargs = mock_post.call_args
                    assert 'http://localhost:9999/api/notify' == args[0]

    def test_data_argument(self):
        with patch('sys.argv', ['notifyhub-push', '{"message": "my test message"}']):
            with patch('notifyhub.cli.requests.post') as mock_post:
                mock_response = MagicMock()
                mock_response.json.return_value = {"success": True}
                mock_post.return_value = mock_response

                with patch('sys.exit') as mock_exit:
                    notifyhub.cli.main()

                    # Check that the correct JSON was sent
                    mock_post.assert_called_once()
                    args, kwargs = mock_post.call_args
                    assert kwargs['json'] == {"message": "my test message"}


class TestCLISuccessBehavior:
    def test_successful_notification(self, capsys):
        with patch('sys.argv', ['notifyhub-push', '{"message": "success message"}']):
            with patch('notifyhub.cli.requests.post') as mock_post:
                mock_response = MagicMock()
                mock_response.json.return_value = {"success": True}
                mock_post.return_value = mock_response

                with patch('sys.exit') as mock_exit:
                    notifyhub.cli.main()

                    # Should print success message and exit with code 0
                    captured = capsys.readouterr()
                    assert '✓ Notification sent successfully' in captured.out
                    mock_exit.assert_called_once_with(0)

    def test_server_response_false(self, capsys):
        with patch('sys.argv', ['notifyhub-push', '{"message": "test"}']):
            with patch('notifyhub.cli.requests.post') as mock_post:
                mock_response = MagicMock()
                mock_response.json.return_value = {"success": False}
                mock_post.return_value = mock_response

                with patch('sys.exit') as mock_exit:
                    notifyhub.cli.main()

                    # Should print error message and exit with code 1
                    captured = capsys.readouterr()
                    assert '✗ Failed to send notification' in captured.out
                    mock_exit.assert_called_once_with(1)


class TestCLIErrorHandling:
    def test_invalid_json(self, capsys):
        with patch('sys.argv', ['notifyhub-push', 'invalid json']):
            with patch('sys.exit') as mock_exit:
                notifyhub.cli.main()

                # Should print invalid JSON error and exit with code 1
                captured = capsys.readouterr()
                assert '✗ Invalid JSON:' in captured.out
                mock_exit.assert_called_once_with(1)

    def test_connection_error(self, capsys):
        with patch('sys.argv', ['notifyhub-push', '{"message": "test"}']):
            with patch('notifyhub.cli.requests.post') as mock_post:
                mock_post.side_effect = notifyhub.cli.requests.exceptions.RequestException("Connection failed")

                with patch('sys.exit') as mock_exit:
                    notifyhub.cli.main()

                    # Should print error message and exit with code 1
                    captured = capsys.readouterr()
                    assert '✗ Error: Connection failed' in captured.out
                    mock_exit.assert_called_once_with(1)

    def test_timeout_error(self, capsys):
        with patch('sys.argv', ['notifyhub-push', '{"message": "test"}']):
            with patch('notifyhub.cli.requests.post') as mock_post:
                mock_post.side_effect = notifyhub.cli.requests.exceptions.Timeout("Timeout")

                with patch('sys.exit') as mock_exit:
                    notifyhub.cli.main()

                    # Should print error message and exit with code 1
                    captured = capsys.readouterr()
                    assert '✗ Error:' in captured.out
                    mock_exit.assert_called_once_with(1)

    def test_http_error(self, capsys):
        with patch('sys.argv', ['notifyhub-push', '{"message": "test"}']):
            with patch('notifyhub.cli.requests.post') as mock_post:
                mock_response = MagicMock()
                mock_response.raise_for_status.side_effect = notifyhub.cli.requests.exceptions.HTTPError("404 Not Found")
                mock_post.return_value = mock_response

                with patch('sys.exit') as mock_exit:
                    notifyhub.cli.main()

                    # Should print error message and exit with code 1
                    captured = capsys.readouterr()
                    assert '✗ Error:' in captured.out
                    mock_exit.assert_called_once_with(1)


class TestCLIHelp:
    def test_help_output(self, capsys):
        with patch('sys.argv', ['notifyhub-push', '--help']):
            with pytest.raises(SystemExit):
                notifyhub.cli.main()

            # Should show help text
            captured = capsys.readouterr()
            assert 'usage:' in captured.out
            assert 'Send notifications' in captured.out