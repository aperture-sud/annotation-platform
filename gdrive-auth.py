import json
import os
from pathlib import Path
from google_auth_oauthlib.flow import Flow

os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

CLIENT_FILE = Path(__file__).parent / "oauth-client.json"
TOKEN_FILE  = Path(__file__).parent / "gdrive-token.json"

with open(CLIENT_FILE) as f:
    client_config = json.load(f)

flow = Flow.from_client_config(
    client_config,
    scopes=["https://www.googleapis.com/auth/drive"],
    redirect_uri="http://localhost",
)

auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent")

print("\nOpen this URL in your browser:\n")
print(auth_url)
print("\nAfter you click Allow, your browser will redirect to localhost")
print("(the page will fail to load — that is fine).")
print("Copy the FULL URL from the address bar and paste it below.\n")

redirect_url = input("Paste the full redirect URL here: ").strip()

flow.fetch_token(authorization_response=redirect_url)
creds = flow.credentials

token_data = {
    "token":         creds.token,
    "refresh_token": creds.refresh_token,
    "token_uri":     creds.token_uri,
    "client_id":     creds.client_id,
    "client_secret": creds.client_secret,
    "scopes":        list(creds.scopes) if creds.scopes else [],
}

TOKEN_FILE.write_text(json.dumps(token_data, indent=2))
print(f"\nDone. Token saved to {TOKEN_FILE}")
