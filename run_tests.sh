#!/usr/bin/env bash
# Run all tests

set -e

echo "Running NotifyHub unit tests..."

# Install test dependencies if not already installed
pip install pytest httpx pytest-asyncio

# Run tests
python -m pytest tests/ -v

echo "All tests passed! ✅"