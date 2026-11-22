import json
import pathlib
import sys

from metrics import Trajectory


def grade(data):
    hidden = json.loads((pathlib.Path(__file__).parent / 'hidden/opportunities.json').read_text())
    chain = next(c for c in hidden['chains'] if c['id'] == data['chain'])
    trajectory = Trajectory(data['baseline'], chain)
    rows = []
    for step, snapshot in enumerate(data['snapshots'], 1):
        metrics = trajectory.advance(snapshot['sources'], step)
        rows.append(dict(success=snapshot['success'], **metrics))
    return dict(chain=data['chain'], turns=rows)


if __name__ == '__main__':
    print(json.dumps(grade(json.load(sys.stdin))))
