# ── INIT SENSE FITXERS ─────────────────────────────────────────────
set -Eeuo pipefail
trap 'code=$?; echo "[INIT] ❌ Error a la línia $LINENO (exit $code)"; exit $code' ERR

echo
npm install -g @salesforce/cli && npm update

echo
# Ensure sf is available in PATH
export PATH="$PATH:$(npm root -g)/@salesforce/cli/bin"


ACA_SF_ORG_CLIENT_ID=3MVG9rZjd7MXFdLhSKI7aMVDTapUmHhDlg4uv8l._iSgHKmMrYP0ND3kjdVo3bkwCXrzQAHq6V5qGSsftVEH6
ACA_SF_ORG_CLIENT_SECRET=49799F9C19F97B8CE413894C5387F5C8AA34E9B0FAB35C051F88FB1F810B71E4
ACA_SF_ORG_CLIENT_USERNAME=marc.pla154@agentforce.com
ACA_SF_ORG_CLIENT_PASSWORD=trompeta3HYSKAbljE0TLWu0N2ylHSYhnG

ALMIRALL_SF_ORG_CLIENT_ID=3MVG9GCMQoQ6rpzTo9RdUCo4wrmFjIVLMVNNzpNXUWfBmTyjayhgBhmDxgxmIIy9xIeEaVdttEu8POkcq2hET
ALMIRALL_SF_ORG_CLIENT_SECRET=05CC45D009214029134583AE0DA35A9D67BA6D2790F273DB9F94C5EA6CBDB537
ALMIRALL_SF_ORG_CLIENT_USERNAME=trevorsmart@ibm-sf-context-testing-2026.com
ALMIRALL_SF_ORG_CLIENT_PASSWORD=trompeta14Arq1snHo7MbjLeBsgsEVRCu

echo
response=$(curl -s -X POST "https://login.salesforce.com/services/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=$ACA_SF_ORG_CLIENT_ID" \
  -d "client_secret=$ACA_SF_ORG_CLIENT_SECRET" \
  -d "username=$ACA_SF_ORG_CLIENT_USERNAME" \
	-d "password=$ACA_SF_ORG_CLIENT_PASSWORD")

echo
export SF_ACCESS_TOKEN=$(echo "$response" | jq -r '.access_token')
export SF_INSTANCE_URL=$(echo "$response" | jq -r '.instance_url')

echo
sf org login access-token --instance-url $SF_INSTANCE_URL --no-prompt --alias ACA

echo
response=$(curl -s -X POST "https://login.salesforce.com/services/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=$ALMIRALL_SF_ORG_CLIENT_ID" \
  -d "client_secret=$ALMIRALL_SF_ORG_CLIENT_SECRET" \
  -d "username=$ALMIRALL_SF_ORG_CLIENT_USERNAME" \
	-d "password=$ALMIRALL_SF_ORG_CLIENT_PASSWORD")

echo
export SF_ACCESS_TOKEN=$(echo "$response" | jq -r '.access_token')
export SF_INSTANCE_URL=$(echo "$response" | jq -r '.instance_url')

echo
sf org login access-token --instance-url $SF_INSTANCE_URL --no-prompt --alias ALMIRALL

echo
sf org list --json
echo