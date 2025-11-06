#!/bin/bash

VERSION=$1
if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/sync-release.sh v1.0.0"
  exit 1
fi

TAG_SHA=$(git rev-list -n 1 $VERSION)
TAG_DATE=$(git log -1 --format=%ct $TAG_SHA)

echo "Syncing release: $VERSION"
echo "Tag SHA: $TAG_SHA"
echo "Tag Date: $TAG_DATE"

npx convex run releases:syncRelease "{\"version\":\"$VERSION\",\"sha\":\"$TAG_SHA\",\"date\":$TAG_DATE}"

