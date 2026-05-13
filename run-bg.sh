#!/bin/bash
cd "$(dirname "$0")"
git pull
npm i
node index.js > router.log 2>&1 &