"""Independent conditional stage reach and payout analysis of published Panda books."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--output', default='artifacts/panda-six-stage-distribution.json')
parser.add_argument('--build-root', type=Path, default=Path(__file__).resolve().parents[1] / '__build__')
args = parser.parse_args()
root = args.build_root
reports = []
for lookup in sorted((root / 'publish_files').glob('lookUpTable_*_0.csv')):
    mode = lookup.name[len('lookUpTable_'):-len('_0.csv')]
    rows = [list(map(int, line.split(','))) for line in lookup.read_text().splitlines() if line]
    weights = {row[0]: row[1] for row in rows}
    mass = sum(weights.values())
    groups = {}
    for line in (root / f'books_{mode}.jsonl').open(encoding='utf-8'):
        book = json.loads(line)
        current_stage = 1
        replaying = False
        bonus = False
        spin_count = 0
        for index, event in enumerate(book['events']):
            kind, data = event['type'], event['data']
            if kind == 'freeSpinTrigger':
                bonus = True
            elif kind == 'triggerExplode' and bonus:
                assert not replaying and data.get('source') == 'stage', (mode, book['id'], index)
                assert book['events'][index-1]['type'] == 'collectSymbols'
                assert book['events'][index+1]['type'] == 'spawnNewStageWilds'
                replaying = True
            elif kind == 'reveal' and bonus:
                assert not replaying, 'Upgrade must settle on the current board'
                spin_count += 1
            elif kind == 'collectSymbols':
                assert bonus and not replaying and current_stage < 6, 'No replay or max-stage food'
            elif kind == 'newStageUnlocked':
                assert replaying and data['stage'] == current_stage+1 <= 6
                current_stage = data['stage']
                replaying = False
        assert not replaying and spin_count <= 30
        trigger = next((e for e in book['events'] if e['type'] == 'freeSpinTrigger'), None)
        if trigger is None:
            continue
        tier = trigger['data']['tier']
        stage = max([1] + [e['data']['stage'] for e in book['events'] if e['type'] == 'newStageUnlocked'])
        weight = weights[book['id']]
        payout = book['payoutMultiplier'] / 100
        group = groups.setdefault(tier, {'mass': 0, 'stages': [dict(mass=0, payout=0, minimum=None, maximum=None, books=0) for _ in range(6)]})
        group['mass'] += weight
        row = group['stages'][stage-1]
        row['mass'] += weight
        row['payout'] += weight * payout
        row['books'] += 1
        if weight:
            row['minimum'] = payout if row['minimum'] is None else min(row['minimum'], payout)
            row['maximum'] = payout if row['maximum'] is None else max(row['maximum'], payout)
    total_mean = sum(weight * cents / 100 for _, weight, cents in rows) / mass
    report = {'mode': mode, 'books': len(rows), 'averagePayout': total_mean,
              'largestBookProbabilityPercent': max(weights.values()) / mass * 100,
              'lookupSha256': hashlib.sha256(lookup.read_bytes()).hexdigest(), 'tiers': []}
    for tier, group in groups.items():
        stages = group['stages']
        report['tiers'].append({'tier': tier, 'stages': [
            {'stage': i+1, 'reachPercent': sum(r['mass'] for r in stages[i:]) / group['mass'] * 100,
             'highestStagePercent': row['mass'] / group['mass'] * 100,
             'averageRoundPayoutWhenHighestStage': row['payout'] / row['mass'] if row['mass'] else None,
             'minimumRoundPayoutWhenHighestStage': row['minimum'],
             'maximumRoundPayoutWhenHighestStage': row['maximum'], 'sampledBooks': row['books']}
            for i, row in enumerate(stages)]})
    reports.append(report)
    print(json.dumps(report), flush=True)
Path(args.output).write_text(json.dumps({'note': 'Stage reach is cumulative and conditional on entering that bonus tier. Payouts are round wins in base-bet x, grouped by highest stage reached.', 'modes': reports}, indent=2), encoding='utf-8')
