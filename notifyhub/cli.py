import argparse
import requests
import sys

def main():
    parser = argparse.ArgumentParser(description='Send notifications to NotifyHub server')
    parser.add_argument('--port', type=int, default=9080, help='Server port')
    parser.add_argument('message', help='Notification message')
    
    args = parser.parse_args()
    
    try:
        response = requests.post(
            f'http://localhost:{args.port}/api/notify',
            json={'message': args.message},
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