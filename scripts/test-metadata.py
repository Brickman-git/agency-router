"""Check generated working documents using the distributed metadata validator."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('agency_artifact', ROOT / 'skills/agency-artifacts/scripts/artifact.py')
artifact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artifact)
paths = list((ROOT / 'prompts').glob('*/PROMPT.md')) + [ROOT / 'templates/PROJECT.example.md', ROOT / 'skills/model-task-prompts/assets/PROJECT.example.md']
with tempfile.TemporaryDirectory(prefix='agency-metadata-') as scratch:
    subprocess.run(['node', str(ROOT / 'scripts/copy-task.mjs'), 'copy', 'BRIEF-02', scratch, 'brief-check'], check=True, capture_output=True)
    paths.append(Path(scratch) / 'work/tasks/brief-check/request.md')
    errors = []
    for path in paths:
        result = artifact.validate(path)
        if result:
            errors.append({'path': path.name, 'errors': result})
    if errors:
        print(json.dumps(errors, ensure_ascii=False, indent=2))
        raise SystemExit(1)
    print(json.dumps({'passed': len(paths), 'failed': 0, 'scope': 'generated prompts, passport templates, exported request metadata'}))
