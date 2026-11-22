import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from metrics import CloneIndex, CodeGraph, Trajectory, normalized, MINIMUM


class MetricsTests(unittest.TestCase):
    def test_nested_helper_tokens_have_one_owner(self):
        code='def outer():\n    def inner(value):\n        return value + 1\n    return inner(2)\n'
        graph=CodeGraph({'src/feature/steps.py':code})
        self.assertEqual(graph.bodies[('src/feature/steps.py','outer')],normalized('return inner(2)'))
        self.assertEqual(graph.bodies[('src/feature/steps.py','outer.inner')],normalized('return value + 1'))
        chain={'package':'feature','turns':[dict(entry='outer',opportunities=[dict(kind='repo',file='base.py',symbol='canonical')])]}
        row=Trajectory({},chain).advance({'src/feature/steps.py':code},1)
        self.assertEqual(row['introducedTokens'],sum(map(len,graph.bodies.values())))

    def test_import_aliases_and_reexports_resolve_to_file_and_symbol(self):
        files = {'src/pkg/helpers.py':'def canonical(x):\n    return x\n',
                 'src/pkg/__init__.py':'from .helpers import canonical as public\n',
                 'src/feature.py':'from pkg import public as aliased\ndef prepare(x):\n    return aliased(x)\n'}
        self.assertIn(('src/pkg/helpers.py','canonical'), CodeGraph(files).reachable('src/feature.py','prepare'))
        files['src/feature.py']='import pkg.helpers as helper\ndef prepare(x):\n    return helper.canonical(x)\n'
        self.assertIn(('src/pkg/helpers.py','canonical'), CodeGraph(files).reachable('src/feature.py','prepare'))

    def test_near_miss_names_shadowing_wrong_files_and_dead_calls_do_not_count(self):
        helper = 'def canonical(x):\n    return x\n'
        base = {'src/pkg/helpers.py':helper,'src/wrong.py':helper}
        failures = [
            'from wrong import canonical\ndef prepare(x):\n    return canonical(x)\n',
            'from pkg.helpers import canonical\ndef prepare(canonical):\n    return canonical(1)\n',
            'from pkg.helpers import canonical\ndef prepare(x):\n    canonical = lambda x: x\n    return canonical(x)\n',
            'from pkg.helpers import canonical\ndef canonical_like(x):\n    return x\ndef prepare(x):\n    return canonical_like(x)\n',
            'from pkg.helpers import canonical\ndef prepare(x):\n    if False:\n        canonical(x)\n    return x\n',
            'from pkg.helpers import canonical\ndef unused(x):\n    return canonical(x)\ndef prepare(x):\n    return x\n',
            'from pkg.helpers import canonical\ndef prepare(x):\n    return x\n    canonical(x)\n',
        ]
        for code in failures:
            with self.subTest(code=code):
                self.assertNotIn(('src/pkg/helpers.py','canonical'), CodeGraph({**base,'src/feature.py':code}).reachable('src/feature.py','prepare'))

    def test_transitive_calls_and_prior_definition_availability(self):
        canonical=dict(kind='repo',file='src/pkg/helpers.py',symbol='canonical')
        earlier=dict(kind='earlier',file='src/feature/steps.py',symbol='prepare',createdAt=1,createdByRequirement='chain-1')
        chain={'package':'feature','turns':[dict(entry='prepare',opportunities=[canonical]),dict(entry='batch',opportunities=[canonical,earlier])]}
        baseline={'src/pkg/helpers.py':'def canonical(x):\n    return x\n'}
        trajectory=Trajectory(baseline,chain)
        first={**baseline,'src/feature/steps.py':'from pkg.helpers import canonical\ndef prepare(x):\n    return canonical(x)\n'}
        self.assertEqual(trajectory.advance(first,1)['reused'],1)
        second={**first,'src/feature/steps.py':first['src/feature/steps.py']+'def batch(xs):\n    return [prepare(x) for x in xs]\n'}
        self.assertEqual(trajectory.advance(second,2)['reused'],2)
        self.assertRaises(ValueError,trajectory.advance,second,2)

    def test_renamed_clones_comments_and_literals_are_normalized(self):
        source='\n'.join(f'answer = answer + {i}' for i in range(30))+'\nreturn answer\n'
        tokens=normalized(source)
        copy=normalized(source.replace('answer','renamed').replace('1','9')+'# ignored\n')
        self.assertEqual(tokens,copy)
        self.assertEqual(CloneIndex({('file','helper'):tokens}).coverage(copy),set(range(len(tokens))))
        self.assertEqual(CloneIndex({('file','helper'):tokens}).coverage(copy,exclude=('file','helper')),set())
        nested=CodeGraph({'f.py':'def outer():\n    "outer docs"\n    def inner():\n        "inner docs"\n        return 1\n    return inner()\n'})
        self.assertNotIn('STR',nested.bodies[('f.py','outer')])

    def test_earlier_capability_can_be_reexported_from_an_actual_agent_definition(self):
        canonical=dict(kind='repo',file='src/base.py',symbol='canonical')
        earlier=dict(kind='earlier',file='src/feature/steps.py',symbol='prepare',createdAt=1,createdByRequirement='chain-1')
        chain={'package':'feature','turns':[dict(entry='prepare',opportunities=[canonical]),dict(entry='batch',opportunities=[canonical,earlier])]}
        baseline={'src/base.py':'def canonical(x):\n    return x\n'}
        first={**baseline,'src/feature/helpers.py':'from base import canonical\ndef actual_helper(x):\n    return canonical(x)\n',
               'src/feature/steps.py':'from .helpers import actual_helper as prepare\n'}
        trajectory=Trajectory(baseline,chain)
        self.assertEqual(trajectory.advance(first,1)['reused'],1)
        second={**first,'src/feature/steps.py':first['src/feature/steps.py']+'def batch(xs):\n    return [prepare(x) for x in xs]\n'}
        self.assertEqual(trajectory.advance(second,2)['reused'],2)

    def test_fixed_minimum_and_changed_control_flow_near_misses(self):
        tokens=['ID','=', 'ID','+', 'NUM']*15
        self.assertGreaterEqual(len(tokens),MINIMUM)
        self.assertFalse(CloneIndex({'x':tokens[:49]}).coverage(tokens[:49]))
        changed=['if','ID',':','return','STR']*15
        self.assertFalse(CloneIndex({'x':tokens}).coverage(changed))
        self.assertFalse(CloneIndex({}).coverage(tokens))
        self.assertEqual(normalized(''),[])
        self.assertTrue(CodeGraph({'broken.py':'def incomplete('}).invalid)

    def test_cross_turn_clones_growth_deletion_and_empty_error_paths(self):
        canonical=dict(kind='repo',file='src/base.py',symbol='canonical')
        chain={'package':'feature','turns':[dict(entry='prepare',opportunities=[canonical])]*5}
        baseline={'src/base.py':'def canonical(x):\n    return str(x)\n'}
        trajectory=Trajectory(baseline,chain)
        empty=trajectory.advance(baseline,1)
        self.assertTrue(empty['emptyGrowth'])
        self.assertEqual(empty['duplicateRate'],0)
        code='def prepare(value):\n'+'\n'.join('    value = value + '+str(i) for i in range(30))+'\n    return value\n'
        first={**baseline,'src/feature/steps.py':code}
        row=trajectory.advance(first,2)
        self.assertGreater(row['netAddedLoc'],0)
        copied={**baseline,'src/feature/steps.py':code+code.replace('prepare','copied').replace('value','renamed')}
        row=trajectory.advance(copied,3)
        self.assertGreater(row['earlierDuplicateTokens'],50)
        cumulative=row['cumulativeDuplicateTokens']
        removed=trajectory.advance(first,4)
        self.assertLess(removed['netAddedLoc'],0)
        self.assertEqual(removed['cumulativeDuplicateTokens'],cumulative)
        invalid=trajectory.advance({**baseline,'src/feature/steps.py':'def broken('},5)
        self.assertIn('src/feature/steps.py',invalid['invalidSources'])
        self.assertRaises(ValueError,Trajectory,{'broken.py':'def broken('},chain)


if __name__ == '__main__':
    unittest.main()
