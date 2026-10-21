""" 
run:
docker compose down -v
when shutting down your device
"""

import subprocess
import sys

def run(command):
    print(f"Running: {command}")
    result = subprocess.run(command, shell=True)
    if result.returncode != 0:
        sys.exit(result.returncode)

if __name__ == "__main__":
    try:
        run("docker compose up -d db")
        run("uv run alembic upgrade head")
        #run("uv run python scripts/reset_dev_data.py --yes")
        run("uv run python scripts/seed.py")
        run("BIRDEYE_DEV_ENDPOINTS_ENABLED=true uv run uvicorn bird_eye.main:app --host 0.0.0.0 --port 8000 --reload")
    except KeyboardInterrupt:
        print("\nStopping development server gracefully. Goodbye!")
        sys.exit(0)










