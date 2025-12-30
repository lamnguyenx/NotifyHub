import argparse
import requests
import sys
import json
from notifyhub.backend.models import Notification

def main():
    parser = argparse.ArgumentParser(description='Send notifications to NotifyHub server')
    parser.add_argument('--port', type=int, default=9080, help='Server port')
    parser.add_argument('data', help='Notification data as JSON string')

    args = parser.parse_args()

    parsed_data = None
    try:
        raw_data = json.loads(args.data)
        parsed_data = Notification.model_validate(raw_data)
    except json.JSONDecodeError as e:
        print(f'✗ Invalid JSON: {e}')
        sys.exit(1)
    except Exception as e:
        print(f'✗ Invalid notification data: {e}')
        sys.exit(1)

    if parsed_data is None:
        return

    try:
        response = requests.post(
            f'http://localhost:{args.port}/api/notify',
            json={"data": parsed_data.model_dump(exclude_none=True)},
            timeout=5
        )
        response.raise_for_status()

        if response.json().get('success'):
            print('✓ Notification sent successfully')
            sys.exit(0)
        else:
            print('✗ Failed to send notification')
            sys.exit(1)

    except requests.exceptions.RequestException as e:
        print(f'✗ Error: {e}')
        sys.exit(1)

if __name__ == '__main__':
    main()