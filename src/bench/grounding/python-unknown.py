"""Conservative unknown bare-call checks; imported names are checked by Groundwork."""
import ast
import builtins
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
results = []
for relative in json.load(sys.stdin):
    try:
        tree = ast.parse((root / relative).read_text())
    except SyntaxError:
        continue
    if any((isinstance(node, ast.ImportFrom) and any(a.name == '*' for a in node.names))
           or (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
               and node.func.id in {'exec', 'eval', 'globals', 'locals'}) for node in ast.walk(tree)):
        continue
    # An over-approximation of bindings avoids flagging callbacks, closures and comprehensions.
    bound = set(dir(builtins))
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            bound.add(node.name)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            bound.add(node.id)
        elif isinstance(node, ast.arg):
            bound.add(node.arg)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            bound.update(alias.asname or alias.name.split('.')[0] for alias in node.names)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id not in bound:
            results.append({'file': relative, 'line': node.lineno, 'column': node.col_offset, 'name': node.func.id})
print(json.dumps(results))
