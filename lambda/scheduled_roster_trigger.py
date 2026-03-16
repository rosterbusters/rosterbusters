import json
import os
import urllib.error
import urllib.request

BACKEND_URL = os.environ["BACKEND_URL"]


def lambda_handler(event, context):
    days_ahead = event.get("days_ahead", 8)
    url = f"{BACKEND_URL}/api/v1/roster/trigger-scheduled-generation?days_ahead={days_ahead}"
    req = urllib.request.Request(
        url, method="POST", headers={"Content-Type": "application/json"}, data=b""
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode())
            print(
                f"triggered={len(body.get('triggered', []))}, skipped={len(body.get('skipped', []))}"
            )
            return {"statusCode": 200, "body": body}
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode()}")
        raise
