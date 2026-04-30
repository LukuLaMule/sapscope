# Deploy Skill
1. Run all tests with `pytest`
2. Rebuild Docker containers: `docker-compose build --no-cache`
3. Restart services: `docker-compose up -d`
4. Verify the app is running by hitting the health endpoint
5. Report any errors found
