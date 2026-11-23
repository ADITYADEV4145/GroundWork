"""Behavior-only contracts; reuse and clone metrics never influence success."""
import copy
import importlib
import json
import pathlib
import sys


def canonical(chain):
    module = importlib.import_module(chain['canonical']['module'])
    fn = getattr(module, chain['canonical']['symbol'])
    return (lambda value: fn(value, max_length=20)) if chain['id'] == 'click-summary' else fn


def check(root, chain, step):
    sys.path.insert(0, str(pathlib.Path(root) / 'src'))
    target = importlib.import_module(chain['package'] + '.steps')
    render = canonical(chain)
    if chain['id'] == 'click-summary':
        values = ['', 'one two. three four', ' a\n b\t c  ', '\b unchanged paragraph\n\nsecond paragraph', 'a very long help paragraph that must be shortened']
    elif chain['id'] == 'click-values':
        values = ['', b'hello', b'\xffa', 42, None, {'a':1}]
    elif chain['id'] == 'pytest-escape':
        values = ['', 'hello', 'a\n\té界', b'\x00\xff', '\\text', '\ud800']
    else:
        async def coro():
            return 1
        async def agen():
            yield 1
        def plain():
            return 1
        values = [coro, agen, plain, None, 1]

    def expected(record):
        return dict(key=record['key'].strip(), value=record['value'],
                    display=render(record['value']), enabled=record.get('enabled', True))

    def raises(call):
        try:
            call()
        except ValueError:
            return
        raise AssertionError('Expected ValueError')

    records = [dict(key=' a'+str(i)+' ', value=value, enabled=i%2==0) for i,value in enumerate(values)]
    before = copy.deepcopy(records)
    for record in records:
        assert target.prepare(record) == expected(record)
        assert target.prepare(record) is not record
    for bad in [None, [], {}, {'key':'','value':values[0]}, {'key':'   ','value':values[0]}, {'key':1,'value':values[0]}, {'key':'x'}, {'key':'x','value':values[0],'enabled':1}]:
        raises(lambda bad=bad: target.prepare(bad))
    if step >= 2:
        assert target.batch(records) == [expected(r) for r in records]
        assert target.batch([]) == []
        raises(lambda: target.batch(tuple(records)))
        raises(lambda: target.batch([records[0], dict(records[0], key=records[0]['key'].strip())]))
        raises(lambda: target.batch([{}]))
    if step >= 3:
        want = {'a':[render(r['value']) for r in records if r['enabled']]}
        assert target.group(records) == want
        assert target.group([]) == {}
        assert target.group([dict(records[0], enabled=False)]) == {}
        raises(lambda: target.group([records[0],records[0]]))
        raises(lambda: target.group(None))
    right = [dict(key='a0', value=values[-1], enabled=False), dict(key='z', value=values[0])]
    right_before = copy.deepcopy(right)
    merged = [expected(right[0])] + [expected(r) for r in records[1:]] + [expected(right[1])]
    if step >= 4:
        assert target.merge(records,right) == merged
        assert target.merge([],[]) == []
        assert target.merge([],right) == [expected(r) for r in right]
        raises(lambda: target.merge(records,[right[0],right[0]]))
        raises(lambda: target.merge(None,[]))
    if step >= 5:
        groups = {}
        for item in merged:
            if item['enabled']:
                groups.setdefault(item['key'][0],[]).append(item['display'])
        assert target.report(records,right) == dict(items=merged, groups=groups,
            count=len(merged), enabled=sum(r['enabled'] for r in merged))
        assert target.report([],[]) == dict(items=[],groups={},count=0,enabled=0)
        raises(lambda: target.report(records,[{}]))
    assert records == before and right == right_before


if __name__ == '__main__':
    root, chain_name, turn = sys.argv[1:]
    hidden = json.loads((pathlib.Path(__file__).parent / 'opportunities.json').read_text())
    chain = next(c for c in hidden['chains'] if c['id'] == chain_name)
    check(root, chain, int(turn))
