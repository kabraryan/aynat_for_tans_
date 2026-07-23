#!/bin/bash
# macOS only: installs a LaunchAgent so Aynat starts at login and restarts on
# crashes. Run from anywhere: bash scripts/install-autostart.sh
set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.aynat.serve"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

# launchd agents cannot read macOS-protected folders (TCC)
case "$APP_DIR" in
  "$HOME/Desktop"* | "$HOME/Documents"* | "$HOME/Downloads"*)
    echo "⚠️  This project lives in a macOS-protected folder ($APP_DIR)."
    echo "   Login services are not allowed to read Desktop/Documents/Downloads."
    echo "   Move the project first, e.g.:  mv \"$APP_DIR\" ~/aynat_app"
    exit 1
    ;;
esac

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$APP_DIR/scripts/serve.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$APP_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/aynat.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/aynat.log</string>
</dict>
</plist>
PLIST_EOF

launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "Service installed. Waiting for the app (first boot can take a minute)..."
for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3000/signin || true)
  if [ "$code" = "200" ]; then
    echo "✅ Aynat is running at http://localhost:3000 and will start at every login."
    exit 0
  fi
  sleep 2
done
echo "⚠️  Installed, but the app hasn't responded yet. Check: tail -f ~/Library/Logs/aynat.log"
