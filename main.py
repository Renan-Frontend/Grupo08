import os
import sys

# Compatibility bootstrap for platforms that run from repository root.
backend_dir = os.path.join(os.path.dirname(__file__), "Backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from main import app  # noqa: E402,F401
