#!/usr/bin/env bash
# scripts/scaffold-issue-branch.sh
# DX-625: Automate branch scaffolding for issue work.
#
# Usage:
#   bash scripts/scaffold-issue-branch.sh <issue-number> "<title>"
#     e.g. bash scripts/scaffold-issue-branch.sh 541 "Automate branch scaffolding"

set -euo pipefail

issue_number="${1:-}"
title="${2:-}"

if [[ -z "$issue_number" || -z "$title" ]]; then
  echo "Usage: $0 <issue-number> \"<title>\""
  echo "  e.g. $0 541 \"Automate branch scaffolding\""
  exit 1
fi

slug=$(echo "$title" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')

track="feat"
if echo "$title" | grep -qiE "^(fix|bug)"; then track="fix"; fi
if echo "$title" | grep -qiE "^(docs?|document)"; then track="docs"; fi
if echo "$title" | grep -qiE "^(chore|cleanup|refactor)"; then track="chore"; fi
if echo "$title" | grep -qiE "^(devops|ci|cd)"; then track="devops"; fi
if echo "$title" | grep -qiE "^(audit|security)"; then track="audit"; fi
if echo "$title" | grep -qiE "^(dx|dev)"; then track="dx"; fi

branch="${track}/${slug}"

echo "Creating branch: $branch"
git checkout main
git pull origin main
git checkout -b "$branch"

echo ""
echo "Branch '$branch' created and checked out."
echo ""
echo "Suggested commit:"
echo "  ${track}: ${slug}"
echo ""
echo "Closes #${issue_number}"
