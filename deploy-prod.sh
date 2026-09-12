#!/bin/bash
git checkout stena-d1sql-prod && npm run build && npx wrangler deploy
