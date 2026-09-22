#!/usr/bin/env python3
import os
import sys
import logging

logging.basicConfig(level=logging.INFO)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from confstack import confstackify
from notifyhub.config import NotifyHubConfig
from notifyhub.bark import get_bark_aes_key, send_bark_notification, _get_dicebear_icon_url

config = confstackify(NotifyHubConfig, "notifyhub")
device_key = config.backend.bark_device_key
aes_key = get_bark_aes_key()

basename = os.path.basename(os.getcwd())
seed = basename[:1].upper() if basename else ""
icon_url = _get_dicebear_icon_url(seed) if seed else ""
message = " ".join(sys.argv[1:]) or "Test from make send-simple-bark"

ok = send_bark_notification(
    device_key=device_key,
    title=basename or "NotifyHub",
    body=message,
    icon_url=icon_url,
    aes_key=aes_key,
)
print(f"Sent: {ok}")