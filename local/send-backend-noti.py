#!/usr/bin/env python3
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from confstack import confstackify
from notifyhub.config import NotifyHubConfig

import requests

config = confstackify(NotifyHubConfig, "notifyhub")
m = " ".join(sys.argv[1:]) or "Test from make send-backend-bark [#opencode.question]"
h = os.environ.get("HOST_MODEL", "").strip() or os.environ.get("HOSTNAME", "").strip()
p = {"data": {"pwd": os.getcwd(), "message": m}}
p["data"]["host_model"] = h or "unknown"
r = requests.post(f"{config.cli.address}/api/notify", json=p, timeout=10)
r.raise_for_status()
print(r.json())