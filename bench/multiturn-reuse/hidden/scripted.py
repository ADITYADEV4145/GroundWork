"""Synthetic calibration solutions, never made available to benchmark agents."""
import ast
import json
import pathlib


PREPARE = '''def prepare(record):
    if not isinstance(record, dict) or "value" not in record:
        raise ValueError("invalid record")
    key = record.get("key")
    if not isinstance(key, str) or not key.strip():
        raise ValueError("invalid key")
    enabled = record.get("enabled", True)
    if not isinstance(enabled, bool):
        raise ValueError("invalid enabled")
    return {"key": key.strip(), "value": record["value"], "display": render(record["value"]), "enabled": enabled}
'''
BATCH = '''def batch(records):
    if not isinstance(records, list):
        raise ValueError("invalid list")
    result = []
    seen = set()
    for record in records:
        item = prepare(record)
        if item["key"] in seen:
            raise ValueError("duplicate")
        seen.add(item["key"])
        result.append(item)
    return result
'''
GROUP = '''def group(records):
    groups = {}
    for item in batch(records):
        if item["enabled"]:
            groups.setdefault(item["key"][0], []).append(item["display"])
    return groups
'''
MERGE = '''def merge(left, right):
    result = {}
    for item in batch(left):
        result[item["key"]] = item
    for item in batch(right):
        result[item["key"]] = item
    return list(result.values())
'''
REPORT = '''def report(left, right):
    items = merge(left, right)
    return {"items": items, "groups": group(items), "count": len(items), "enabled": sum(item["enabled"] for item in items)}
'''
FUNCTIONS = [PREPARE, BATCH, GROUP, MERGE, REPORT]


def renamed(source, names):
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id in names:
            node.id = names[node.id]
        if isinstance(node, ast.FunctionDef) and node.name in names:
            node.name = names[node.name]
    return ast.unparse(tree) + '\n'


def canonical_copy(root, chain):
    spec = chain['canonical']
    tree = ast.parse((pathlib.Path(root) / spec['file']).read_text())
    fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == spec['symbol'])
    source = ast.unparse(fn)
    if chain['id'] == 'click-summary':
        source = source.replace('max_length: int=45', 'max_length: int=20')
    if chain['id'] == 'pytest-escape':
        source = '_non_printable_ascii_translate_table = {i: f"\\\\x{i:02x}" for i in range(128) if i not in range(32, 127)}\n_non_printable_ascii_translate_table.update({ord("\\t"): "\\\\t", ord("\\r"): "\\\\r", ord("\\n"): "\\\\n"})\n' + source
    if chain['id'] == 'pytest-async':
        helper = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'iscoroutinefunction')
        source = ast.unparse(helper) + '\n' + source
    return source, spec['symbol']


def solution(root, chain, step, style):
    if style == 'ideal':
        spec = chain['canonical']
        source = f"from {spec['module']} import {spec['symbol']} as _canonical\n"
        source += 'def render(value):\n    return _canonical(value' + (', max_length=20' if chain['id'] == 'click-summary' else '') + ')\n'
        return source + '\n'.join(FUNCTIONS[:step])
    if style != 'copy':
        raise ValueError('Unknown synthetic style')
    canonical, symbol = canonical_copy(root, chain)
    source = 'import sys\nimport inspect\nimport typing as t\n'
    for turn in range(1, step + 1):
        suffix = str(turn)
        names = {symbol:'_render'+suffix, 'render':'_render'+suffix}
        for name in ['prepare','batch','group','merge']:
            names[name] = '_'+name+suffix
        source += renamed(canonical, names)
        for i, fn in enumerate(FUNCTIONS[:turn]):
            local_names = dict(names)
            if i == turn - 1:
                local_names.pop(['prepare','batch','group','merge','report'][i], None)
            source += renamed(fn, local_names)
    return source


if __name__ == '__main__':
    import sys
    root, chain_name, step, style = sys.argv[1:]
    chains = json.loads((pathlib.Path(__file__).parent / 'opportunities.json').read_text())['chains']
    chain = next(c for c in chains if c['id'] == chain_name)
    print(solution(root, chain, int(step), style))
