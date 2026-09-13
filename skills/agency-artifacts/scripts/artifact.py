#!/usr/bin/env python3
"""Create draft artifacts and validate metadata. No network calls or status transitions."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import uuid
import yaml
from jsonschema import Draft202012Validator, FormatChecker

BASE = Path(__file__).resolve().parent.parent
SCHEMA = json.loads((BASE / 'assets/metadata.schema.json').read_text())
Draft202012Validator.check_schema(SCHEMA)
VALIDATOR = Draft202012Validator(SCHEMA, format_checker=FormatChecker())

class UniqueLoader(yaml.SafeLoader):
    pass

def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if not isinstance(key, str):
            raise ValueError("Object keys must be strings")
        if key in result:
            raise ValueError('Duplicate metadata/data key')
        result[key] = value
    return result

def yaml_mapping(loader, node):
    return unique_pairs((loader.construct_object(k), loader.construct_object(v)) for k, v in node.value)

UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, yaml_mapping)
UniqueLoader.add_constructor('tag:yaml.org,2002:timestamp', lambda loader, node: loader.construct_scalar(node))

def reject_constant(value):
    raise ValueError("Non-finite values are not valid JSON")

def read_meta(path):
    path = Path(path)
    text = path.read_text(encoding='utf-8-sig')
    if path.suffix.lower() in ('.md', '.markdown'):
        lines = text.splitlines()
        if not lines or lines[0] != '---':
            raise ValueError('Markdown requires YAML front matter at line 1')
        try:
            end = lines.index('---', 1)
        except ValueError:
            raise ValueError('Unclosed YAML front matter') from None
        value = yaml.load('\n'.join(lines[1:end]), Loader=UniqueLoader)
    elif path.suffix.lower() == '.json':
        obj = json.loads(text, object_pairs_hook=unique_pairs, parse_constant=reject_constant)
        if not isinstance(obj, dict):
            raise ValueError('Managed JSON must be an object; use a sidecar for arrays')
        if '_meta' in obj:
            value = obj['_meta']
        elif path.name.endswith('.meta.json'):
            value = obj
            if not value.get('target'):
                raise ValueError('Sidecar requires target')
        else:
            raise ValueError('JSON requires _meta, or a separate .meta.json sidecar')
    else:
        raise ValueError('Use a sidecar for raw, JSONL and binary formats')
    if not isinstance(value, dict):
        raise ValueError('Metadata must be an object')
    return value

def validate_meta(meta):
    errors = [(' / '.join(str(x) for x in e.absolute_path) or '_meta') + ': violates ' + str(e.validator)
              for e in VALIDATOR.iter_errors(meta)]
    if errors:
        return errors
    times = {}
    values = {'created_at': meta['created_at'], 'updated_at': meta['updated_at']}
    if meta.get('review'):
        values['review.decided_at'] = meta['review']['decided_at']
    for key, value in values.items():
        try:
            parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
            if parsed.tzinfo is None or 'T' not in value:
                raise ValueError('Timezone and time required')
            times[key] = parsed
        except (ValueError, TypeError):
            errors.append(key + ': requires ISO 8601 datetime with timezone')
    if errors:
        return errors
    if times['updated_at'] < times['created_at']:
        errors.append('updated_at: precedes created_at')
    if meta.get('review') and not times['created_at'] <= times['review.decided_at'] <= times['updated_at']:
        errors.append('review.decided_at: outside document time range')
    return errors

def validate(path):
    return validate_meta(read_meta(path))

def draft(title, department):
    now = datetime.now(timezone.utc).isoformat(timespec='seconds')
    return dict(schema_version='agency-artifact/1.0', artifact_id='art_' + uuid.uuid4().hex,
                artifact_type='brief', title=title, scope='project', project_id=None,
                department=department, task_ref=None, owner=dict(kind='role', id=None),
                status='draft', version=1, created_at=now, updated_at=now, access='internal',
                source_refs=[], depends_on=[], review=None)

def init(path, kind, title, department, artifact_type="brief"):
    path = Path(path)
    if kind not in ('md', 'json') or path.suffix.lower() != '.' + kind:
        raise ValueError('Format and extension must match')
    meta = draft(title, department)
    meta["artifact_type"] = artifact_type
    errors = validate_meta(meta)
    if errors:
        raise ValueError('; '.join(errors))
    content = ('---\n' + yaml.safe_dump(meta, allow_unicode=True, sort_keys=False) + '---\n\n# ' + title + '\n\n' if kind == 'md'
               else json.dumps({'_meta': meta, 'data': {}}, ensure_ascii=False, indent=2) + '\n')
    # Refuse overwrite, including a symlink target. Parent directory must already exist.
    with path.open('x', encoding='utf-8') as stream:
        stream.write(content)
    return meta

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    check = commands.add_parser('validate'); check.add_argument('paths', nargs='+')
    create = commands.add_parser('init'); create.add_argument('path'); create.add_argument('--format', required=True, choices=['md','json']); create.add_argument('--title', required=True); create.add_argument('--department', required=True); create.add_argument('--type', dest='artifact_type', default='brief', choices=SCHEMA['properties']['artifact_type']['enum'])
    args = parser.parse_args()
    if args.command == 'init':
        init(args.path, args.format, args.title, args.department, args.artifact_type)
        print(json.dumps({'created': args.path, 'status': 'draft', 'bindings': 'project/owner/task require completion'}, ensure_ascii=False)); return 0
    results = []
    for path in args.paths:
        try:
            errors = validate(path)
        except (ValueError, OSError, yaml.YAMLError):
            errors = ['parse/read failed; verify format, duplicate keys and path']
        results.append({'path': path, 'valid': not errors, 'errors': errors})
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0 if all(r['valid'] for r in results) else 1

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError) as error:
        # No payload or credential values in errors.
        print('Artifact operation failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
