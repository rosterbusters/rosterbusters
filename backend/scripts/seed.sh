#!/usr/bin/env bash
set -e

echo "Starting database seeding..."
python app/seed_data.py
