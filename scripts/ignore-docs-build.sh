#!/bin/sh
# Vercel: exit 0 to skip, exit 1 to build. Compare against the last successful
# deployment so a docs commit cannot hide code that has not been deployed yet.
if [ -z "$VERCEL_GIT_PREVIOUS_SHA" ] || ! git cat-file -e "$VERCEL_GIT_PREVIOUS_SHA^{commit}" 2>/dev/null; then
  exit 1
fi

git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- . ':!*.md' ':!**/*.md' ':!docs/**'
result=$?
if [ "$result" -eq 0 ]; then
  echo 'Skipping deployment: only documentation changed since the previous deployment.'
  exit 0
fi
exit 1
