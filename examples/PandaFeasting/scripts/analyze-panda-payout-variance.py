"""Published payout quantiles, variance and max-win odds, without reading book events."""
import argparse
import hashlib
import json
import math
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1] / '__build__'
costs = dict(base=1, extraChance=1.5, extraChance2=3, featureSpin=50, bonusFeature=100, superBonusFeature=300, hiddenBonusFeature=1000)
report = {}
for mode, cost in costs.items():
    lookup = root / 'publish_files' / f'lookUpTable_{mode}_0.csv'
    rows = [tuple(map(int, line.split(','))) for line in lookup.read_text().splitlines() if line]
    mass = sum(weight for _, weight, _ in rows)
    mean = sum(weight * payout / 100 for _, weight, payout in rows) / mass
    variance = sum(weight * (payout / 100 - mean) ** 2 for _, weight, payout in rows) / mass
    ordered = sorted((payout / 100, weight) for _, weight, payout in rows if weight)
    def quantile(fraction):
        cumulative = 0
        for payout, weight in ordered:
            cumulative += weight
            if cumulative >= mass * fraction:
                return payout
        return ordered[-1][0]
    max_probability = sum(weight for _, weight, payout in rows if payout == 1_000_000) / mass
    report[mode] = {
        'cost': cost, 'books': len(rows), 'meanBaseBetX': mean, 'rtp': mean / cost,
        'standardDeviationBaseBetX': math.sqrt(variance),
        'quantilesBaseBetX': {str(q): quantile(q) for q in [0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 0.999, 1]},
        'belowCostFractions': {str(ratio): sum(weight for _, weight, payout in rows if payout / 100 < cost * ratio) / mass for ratio in [0.1, 0.25, 0.5, 1, 2, 5]},
        'maxWinOneIn': 1 / max_probability,
        'largestBookProbability': max(weight for _, weight, _ in rows) / mass,
        'lookupSha256': hashlib.sha256(lookup.read_bytes()).hexdigest(),
    }
Path(args.output).write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
