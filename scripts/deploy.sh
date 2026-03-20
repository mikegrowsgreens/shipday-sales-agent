#!/bin/bash
set -e

SERVER="root@167.172.119.28"
DEPLOY_DIR="/var/www/saleshub"

echo "=== SalesHub Deploy ==="

echo "Building..."
npm run build

echo "Deploying to server..."
rsync -avz --delete .next/ ${SERVER}:${DEPLOY_DIR}/.next/
rsync -avz node_modules/ ${SERVER}:${DEPLOY_DIR}/node_modules/
rsync -avz public/ ${SERVER}:${DEPLOY_DIR}/public/
scp package.json ${SERVER}:${DEPLOY_DIR}/
scp ecosystem.config.js ${SERVER}:${DEPLOY_DIR}/

echo "Restarting application..."
ssh ${SERVER} "cd ${DEPLOY_DIR} && pm2 reload saleshub || pm2 start ecosystem.config.js"

echo "Deploy complete!"
