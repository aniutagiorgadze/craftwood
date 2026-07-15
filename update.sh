#!/bin/bash
# Craftwood — კოდის განახლება GitHub-ზე (საიტი ავტომატურად განახლდება Actions-ით)

set -e

PROJECT_DIR="$HOME/Projects/craftwood"
REPO="aniutagiorgadze/craftwood"
SITE="https://aniutagiorgadze.github.io/craftwood/"
ADMIN="https://aniutagiorgadze.github.io/craftwood/admin/"
ACTIONS="https://github.com/${REPO}/actions"

cd "$PROJECT_DIR"

echo "=== Craftwood განახლება ==="
echo ""

# შემოწმება: git რეპოზიტორია
if [ ! -d .git ]; then
  echo "❌ .git არ მოიძებნა. საქაღალდე: $PROJECT_DIR"
  exit 1
fi

# ცვლილებების ჩვენება
echo "📋 ცვლილებები:"
git status -sb
echo ""

# თუ არაფერი შეცვლილა
if git diff --quiet && git diff --cached --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "ℹ️  ლოკალური ცვლილებები არ არის."
  echo ""
  read -rp "მაინც გსურთ push? (y/N): " FORCE
  if [[ ! "$FORCE" =~ ^[yY]$ ]]; then
    echo "გაუქმდა."
    exit 0
  fi
else
  # commit შეტყობინება
  DEFAULT_MSG="Update craftwood site"
  read -rp "Commit შეტყობინება [$DEFAULT_MSG]: " MSG
  MSG="${MSG:-$DEFAULT_MSG}"

  git add -A
  git commit -m "$MSG"
  echo ""
  echo "✓ Commit შექმნილია"
fi

echo ""
echo "📤 Push GitHub-ზე..."
git push origin main

echo ""
echo "=== წარმატება ==="
echo ""
echo "Deploy მიმდინარეობს (2-5 წუთი):"
echo "  $ACTIONS"
echo ""
echo "საიტი:"
echo "  $SITE"
echo ""
echo "ადმინი:"
echo "  $ADMIN"
echo ""
echo "განახლების შემდეგ: Cmd + Shift + R"
