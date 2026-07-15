#!/bin/bash
set -euo pipefail

REPO="aniutagiorgadze/craftwood"
PROJECT_DIR="$HOME/Projects/craftwood"
SSH_KEY="$HOME/.ssh/id_ed25519_craftwood"
SSH_PUB="${SSH_KEY}.pub"

echo "=== Craftwood GitHub Setup ==="

# SSH config
if ! grep -q "Host github.com" "$HOME/.ssh/config" 2>/dev/null; then
  cat >> "$HOME/.ssh/config" <<EOF

Host github.com
  HostName github.com
  User git
  IdentityFile $SSH_KEY
  IdentitiesOnly yes
EOF
  chmod 600 "$HOME/.ssh/config"
  echo "✓ SSH config updated"
fi

# Known hosts
ssh-keyscan -t ed25519 github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null || true

cd "$PROJECT_DIR"
git remote set-url origin "git@github.com:${REPO}.git"
echo "✓ Remote set to SSH"

# Try gh auth first
if gh auth status &>/dev/null; then
  echo "✓ GitHub CLI authenticated"
  gh auth setup-git 2>/dev/null || true

  # Add SSH key to GitHub if not already there
  KEY_CONTENT=$(cat "$SSH_PUB")
  if ! gh ssh-key list 2>/dev/null | grep -q "craftwood"; then
    gh ssh-key add "$SSH_PUB" --title "craftwood-mac" 2>/dev/null && echo "✓ SSH key added to GitHub"
  fi
else
  echo ""
  echo "GitHub CLI not logged in. Run this first:"
  echo "  gh auth login"
  echo ""
  echo "Or add SSH key manually:"
  echo "  1. Open: https://github.com/settings/ssh/new"
  echo "  2. Title: craftwood-mac"
  echo "  3. Paste this key:"
  echo ""
  cat "$SSH_PUB"
  echo ""
  read -rp "Press Enter after adding the SSH key to GitHub..."
fi

# Test SSH
echo "Testing GitHub SSH connection..."
ssh -T git@github.com 2>&1 || true

# Push
echo "Pushing to GitHub..."
git push -u origin main
echo "✓ Code pushed!"

# Enable GitHub Pages
if gh auth status &>/dev/null; then
  echo "Enabling GitHub Pages..."
  gh api "repos/${REPO}/pages" -X POST \
    -f build_type=workflow \
    -f source[branch]=main \
    -f source[path]=/ 2>/dev/null || \
  gh workflow run deploy.yml --repo "$REPO" 2>/dev/null || true
  echo "✓ GitHub Pages configured"
fi

echo ""
echo "=== Done! ==="
echo "Site:  https://aniutagiorgadze.github.io/craftwood/"
echo "Admin: https://aniutagiorgadze.github.io/craftwood/admin/"
echo ""
echo "Wait 2-5 minutes for the site to go live."
