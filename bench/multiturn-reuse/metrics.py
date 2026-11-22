"""Independent Python AST/call-resolution and normalized-token winnowing metrics."""
import ast
import copy
import difflib
import hashlib
import io
import keyword
import pathlib
import tokenize

K = 25
WINDOW = 4
MINIMUM = 50


def normalized(source):
    result = []
    try:
        for token in tokenize.generate_tokens(io.StringIO(source).readline):
            if token.type in (tokenize.COMMENT, tokenize.NL, tokenize.NEWLINE,
                              tokenize.INDENT, tokenize.DEDENT, tokenize.ENDMARKER,
                              tokenize.ENCODING):
                continue
            if token.type == tokenize.NAME:
                result.append(token.string if keyword.iskeyword(token.string) else 'ID')
            elif token.type == tokenize.STRING:
                result.append('STR')
            elif token.type == tokenize.NUMBER:
                result.append('NUM')
            elif token.string.strip():
                result.append(token.string)
    except (tokenize.TokenError, IndentationError):
        pass
    return result


class OwnBody(ast.NodeTransformer):
    def visit_FunctionDef(self, node):
        return None

    visit_AsyncFunctionDef = visit_FunctionDef
    visit_ClassDef = visit_FunctionDef


def body_tokens(node, source):
    statements = copy.deepcopy(node.body)
    if statements and isinstance(statements[0], ast.Expr) and isinstance(statements[0].value, ast.Constant) and isinstance(statements[0].value.value, str):
        statements.pop(0)
    module = OwnBody().visit(ast.Module(body=statements, type_ignores=[]))
    for child in ast.walk(module):
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if child.body and isinstance(child.body[0], ast.Expr) and isinstance(child.body[0].value, ast.Constant) and isinstance(child.body[0].value.value, str):
                child.body.pop(0)
    return normalized(ast.unparse(module))


def fingerprints(tokens):
    hashes = [hashlib.sha256('\x00'.join(tokens[i:i + K]).encode()).digest()
              for i in range(len(tokens) - K + 1)]
    selected = {}
    for i in range(max(0, len(hashes) - WINDOW + 1)):
        minimum = min(hashes[i:i + WINDOW])
        index = max(j for j in range(i, i + WINDOW) if hashes[j] == minimum)
        selected[index] = minimum
    return [(value, index) for index, value in selected.items()]


class CloneIndex:
    def __init__(self, bodies):
        self.bodies = bodies
        self.index = {}
        for identity, tokens in bodies.items():
            for value, position in fingerprints(tokens):
                self.index.setdefault(value, []).append((identity, position))

    def coverage(self, tokens, exclude=None):
        marked = set()
        seen = set()
        for value, start in fingerprints(tokens):
            for identity, other in self.index.get(value, []):
                if identity == exclude or (isinstance(identity, tuple) and identity[:2] == exclude):
                    continue
                reference = self.bodies[identity]
                if tokens[start:start + K] != reference[other:other + K]:
                    continue
                left, right = start, start + K
                rleft, rright = other, other + K
                while left > 0 and rleft > 0 and tokens[left - 1] == reference[rleft - 1]:
                    left -= 1
                    rleft -= 1
                while right < len(tokens) and rright < len(reference) and tokens[right] == reference[rright]:
                    right += 1
                    rright += 1
                if (identity, left, right) in seen:
                    continue
                seen.add((identity, left, right))
                if right - left >= MINIMUM:
                    marked.update(range(left, right))
        return marked


def module_name(file):
    parts = pathlib.PurePosixPath(file).with_suffix('').parts
    if parts and parts[0] == 'src':
        parts = parts[1:]
    if parts and parts[-1] == '__init__':
        parts = parts[:-1]
    return '.'.join(parts)


class CodeGraph:
    def __init__(self, files):
        self.modules = {}
        self.definitions = {}
        self.invalid = []
        for file, source in files.items():
            try:
                tree = ast.parse(source)
            except (SyntaxError, ValueError):
                self.invalid.append(file)
                continue
            module = module_name(file)
            imports = {}
            for node in tree.body:
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        imports[alias.asname or alias.name.split('.')[0]] = alias.name if alias.asname else alias.name.split('.')[0]
                elif isinstance(node, ast.ImportFrom):
                    base = node.module or ''
                    if node.level:
                        parent = module.split('.') if file.endswith('/__init__.py') else module.split('.')[:-1]
                        base = '.'.join(parent[:len(parent) - node.level + 1] + ([base] if base else []))
                    for alias in node.names:
                        if alias.name != '*':
                            imports[alias.asname or alias.name] = base + '.' + alias.name
                elif isinstance(node, (ast.Assign, ast.AnnAssign)):
                    targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                    for target in targets:
                        for name in ast.walk(target):
                            if isinstance(name, ast.Name):
                                imports[name.id] = None
            self.modules[module] = (file, imports)
            for node in tree.body:
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    self.definitions[module + '.' + node.name] = dict(file=file, node=node, source=source, module=module)
        self.bodies = all_bodies(files)

    def overlay(self, files):
        result = object.__new__(CodeGraph)
        changed = CodeGraph(files)
        result.modules = {name: entry for name, entry in self.modules.items() if entry[0] not in files}
        result.modules.update(changed.modules)
        result.definitions = {name: definition for name, definition in self.definitions.items() if definition['file'] not in files}
        result.definitions.update(changed.definitions)
        result.invalid = [file for file in self.invalid if file not in files] + changed.invalid
        result.bodies = changed.bodies
        return result

    def resolve(self, qualified, seen=None):
        if not qualified:
            return None
        if qualified in self.definitions:
            return qualified
        seen = set() if seen is None else seen
        if qualified in seen:
            return None
        seen.add(qualified)
        module, _, name = qualified.rpartition('.')
        entry = self.modules.get(module)
        target = entry[1].get(name) if entry else None
        return self.resolve(target, seen) if target else None

    def edges(self, name):
        definition = self.definitions[name]
        node, module = definition['node'], definition['module']
        bindings = dict(self.modules[module][1])
        for other in self.definitions:
            if other.rpartition('.')[0] == module:
                bindings[other.rpartition('.')[2]] = other
        for arg in [*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs]:
            bindings[arg.arg] = None
        if node.args.vararg:
            bindings[node.args.vararg.arg] = None
        if node.args.kwarg:
            bindings[node.args.kwarg.arg] = None
        # Python's lexical locals shadow module names even before assignment.
        for child in ast.walk(node):
            if isinstance(child, ast.Name) and isinstance(child.ctx, ast.Store):
                bindings[child.id] = None
            elif isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)) and child is not node:
                bindings[child.name] = None
        found = set()

        def target(expr):
            if isinstance(expr, ast.Name):
                return bindings.get(expr.id)
            if isinstance(expr, ast.Attribute):
                base = target(expr.value)
                return base + '.' + expr.attr if base else None
            return None

        def visit(statement):
            if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
                return
            if isinstance(statement, (ast.Assign, ast.AnnAssign, ast.AugAssign, ast.NamedExpr)):
                if statement.value is not None:
                    visit(statement.value)
                targets = statement.targets if isinstance(statement, ast.Assign) else [statement.target]
                for assigned in targets:
                    visit(assigned)
                return
            if isinstance(statement, ast.Name) and isinstance(statement.ctx, (ast.Store, ast.Del)):
                bindings[statement.id] = None
            if isinstance(statement, ast.If) and isinstance(statement.test, ast.Constant):
                for child in (statement.body if statement.test.value else statement.orelse):
                    visit(child)
                return
            if isinstance(statement, ast.ImportFrom):
                base = statement.module or ''
                if statement.level:
                    parent = module.split('.')[:-1]
                    base = '.'.join(parent[:len(parent) - statement.level + 1] + ([base] if base else []))
                for alias in statement.names:
                    if alias.name != '*':
                        bindings[alias.asname or alias.name] = base + '.' + alias.name
            elif isinstance(statement, ast.Import):
                for alias in statement.names:
                    bindings[alias.asname or alias.name.split('.')[0]] = alias.name if alias.asname else alias.name.split('.')[0]
            elif isinstance(statement, ast.Call):
                resolved = self.resolve(target(statement.func))
                if resolved:
                    found.add(resolved)
            for child in ast.iter_child_nodes(statement):
                visit(child)
        for statement in node.body:
            visit(statement)
            if isinstance(statement, (ast.Return, ast.Raise)):
                break
        return found

    def reachable(self, file, symbol):
        entry = self.resolve(module_name(file) + '.' + symbol)
        pending = [entry] if entry else []
        seen = set()
        while pending:
            name = pending.pop()
            if name in seen:
                continue
            seen.add(name)
            pending.extend(self.edges(name) - seen)
        return {(self.definitions[n]['file'], self.definitions[n]['node'].name) for n in seen}


def read_sources(root):
    root = pathlib.Path(root)
    return {p.relative_to(root).as_posix(): p.read_text(encoding='utf8')
            for p in root.rglob('*.py') if '.git' not in p.parts and '__pycache__' not in p.parts}


def all_bodies(files):
    bodies = {}
    for file, source in files.items():
        try:
            tree = ast.parse(source)
        except (SyntaxError, ValueError):
            continue
        def walk(nodes, scope=''):
            for node in nodes:
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    identity = scope + node.name
                    bodies[(file, identity)] = body_tokens(node, source)
                    walk(node.body, identity + '.')
                elif isinstance(node, ast.ClassDef):
                    walk(node.body, scope + node.name + '.')
                else:
                    walk(ast.iter_child_nodes(node), scope)
        walk(tree.body)
    return bodies


class Trajectory:
    def __init__(self, baseline, chain):
        self.baseline = baseline
        self.chain = chain
        self.baseline_graph = CodeGraph(baseline)
        if self.baseline_graph.invalid:
            raise ValueError('Cannot parse pinned baseline: ' + repr(self.baseline_graph.invalid))
        self.repo_index = CloneIndex(self.baseline_graph.bodies)
        self.previous = {}
        self.history = {}
        self.created = {}
        self.capabilities = {}
        self.introduced = 0
        self.repo_copied = 0
        self.earlier_copied = 0
        self.union_copied = 0
        self.opportunities = []
        self.curves = []
        self.previous_loc = 0

    def advance(self, sources, step):
        if step != len(self.curves) + 1 or not 1 <= step <= 5:
            raise ValueError('Expected next turn, 1 through 5')
        file = f"src/{self.chain['package']}/steps.py"
        added = {f:s for f,s in sources.items() if f not in self.baseline}
        graph = self.baseline_graph.overlay({f:s for f,s in sources.items() if self.baseline.get(f) != s})
        current = all_bodies(added)
        for invalid in graph.invalid:
            if invalid in added:
                current[(invalid, '<invalid>')] = normalized(added[invalid])
        earlier = CloneIndex(self.history)
        n = repo_n = earlier_n = union_n = 0
        for identity, tokens in current.items():
            before = self.previous.get(identity, [])
            new = set()
            for kind, _, _, start, end in difflib.SequenceMatcher(a=before, b=tokens, autojunk=False).get_opcodes():
                if kind in ('insert', 'replace'):
                    new.update(range(start, end))
            if not new:
                continue
            repo = self.repo_index.coverage(tokens)
            prior = earlier.coverage(tokens, exclude=identity)
            n += len(new)
            repo_n += len(new & repo)
            earlier_n += len(new & prior)
            union_n += len(new & (repo | prior))
        self.introduced += n
        self.repo_copied += repo_n
        self.earlier_copied += earlier_n
        self.union_copied += union_n
        for identity in current:
            self.created.setdefault(identity, step)
        self.previous = current
        for identity, tokens in current.items():
            self.history[(*identity, step)] = tokens
        turn = self.chain['turns'][step - 1]
        resolved = graph.resolve(module_name(file) + '.' + turn['entry'])
        if resolved:
            definition = graph.definitions[resolved]
            identity = (definition['file'], definition['node'].name)
            if self.created.get(identity) == step:
                self.capabilities[(file, turn['entry'], step)] = identity
        reached = graph.reachable(file, turn['entry'])
        planted = []
        for opportunity in turn['opportunities']:
            identity = ((opportunity['file'], opportunity['symbol']) if opportunity['kind'] == 'repo'
                        else self.capabilities.get((opportunity['file'], opportunity['symbol'], opportunity['createdAt'])))
            planted.append(dict(**opportunity, reused=identity in reached))
        self.opportunities.append((file, turn))
        final_reused = final_total = 0
        for entry_file, planted_turn in self.opportunities:
            reachable = graph.reachable(entry_file, planted_turn['entry'])
            for op in planted_turn['opportunities']:
                identity = ((op['file'], op['symbol']) if op['kind'] == 'repo'
                            else self.capabilities.get((op['file'], op['symbol'], op['createdAt'])))
                final_total += 1
                final_reused += identity in reachable
        loc = sum(sum(bool(line.strip()) for line in source.splitlines()) for source in added.values())
        metrics = dict(turn=step, introducedTokens=n, cumulativeTokens=self.introduced,
            repoDuplicateTokens=repo_n, earlierDuplicateTokens=earlier_n,
            cumulativeRepoDuplicateTokens=self.repo_copied,
            cumulativeEarlierDuplicateTokens=self.earlier_copied,
            cumulativeDuplicateTokens=self.union_copied,
            duplicateRate=self.union_copied / self.introduced if self.introduced else 0,
            emptyGrowth=self.introduced == 0,
            opportunities=len(planted), reused=sum(p['reused'] for p in planted),
            reuseRate=sum(p['reused'] for p in planted) / len(planted),
            cumulativeOpportunities=final_total, cumulativeReused=final_reused,
            cumulativeReuseRate=final_reused / final_total,
            netAddedLoc=loc - self.previous_loc, cumulativeLoc=loc,
            invalidSources=graph.invalid, planted=planted)
        self.previous_loc = loc
        self.curves.append(metrics)
        return metrics
