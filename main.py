import os
import sys
import importlib.util

# Compatibility bootstrap for platforms that run from repository root.
backend_dir = os.path.join(os.path.dirname(__file__), "Backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

backend_main_path = os.path.join(backend_dir, "main.py")
spec = importlib.util.spec_from_file_location("bp_backend_main", backend_main_path)
if spec is None or spec.loader is None:
    raise RuntimeError("Nao foi possivel carregar Backend/main.py")

backend_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend_module)

app = backend_module.app
