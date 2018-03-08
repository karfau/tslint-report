#!/usr/bin/env bash
set -e

CURR_BRANCH=`(git symbolic-ref --short HEAD)`
if [[ "master" = "$CURR_BRANCH" ]]
then
  echo "current branch is master, not checking" && exit 0
fi
#echo "current branch is $CURR_BRANCH"
CURR_VERSION=`(node -p "($(cat ./package.json)).version")`
echo "current branch '$CURR_BRANCH' is at version '$CURR_VERSION'"

MASTER_VERSION=`(node -p "($(git show origin/master:package.json)).version")`
echo "master branch is at version '$MASTER_VERSION'"
if [[ "$CURR_VERSION" = "$MASTER_VERSION" ]]
then
  echo "Error: Current branch has same version as master, you need to increase it before merging."
  exit 2
fi
echo "all good: current branch has version different from master"
