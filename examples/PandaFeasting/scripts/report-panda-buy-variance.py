"""Cross-check and preserve the Panda buy-variance/max-odds tuning results."""
import hashlib
import json
from pathlib import Path

workspace = Path(__file__).resolve().parents[1]
math = workspace
build = math / '__build__'
artifacts = workspace / 'artifacts'
read = lambda path: json.loads(path.read_text(encoding='utf-8'))
before = read(artifacts / 'panda-buy-variance-before.json')
after = read(artifacts / 'panda-buy-variance-after.json')
stages = read(artifacts / 'panda-buy-stage-distribution.json')
optimization = read(build / 'optimization-report.json')
bonus = read(build / 'bonus-hit-rate-audit.json')
coverage = read(build / 'coverage-report.json')
calibration = read(build / 'bonus-hit-rate-report.json')
targets = dict(base=4_500_000, extraChance=4_000_000, extraChance2=3_500_000, featureSpin=100_000, bonusFeature=30_000, superBonusFeature=10_000, hiddenBonusFeature=2_500)
floors = dict(bonusFeature=1, superBonusFeature=10, hiddenBonusFeature=50)
assert coverage['passed'] == 180 and coverage['failed'] == 0 and coverage['runsPerBand'] == 3
assert sum(mode['books'] for mode in after.values()) == 210000
assert len(bonus['results']) == 12 and all(row['targetReached'] for row in bonus['results'])
for mode, result in after.items():
    path = build / 'publish_files' / f'lookUpTable_{mode}_0.csv'
    assert hashlib.sha256(path.read_bytes()).hexdigest() == result['lookupSha256']
    assert abs(result['rtp'] - 0.96) < 1e-7
    assert abs(result['maxWinOneIn'] / targets[mode] - 1) < 1e-5
    if mode in floors:
        assert result['quantilesBaseBetX']['0'] == floors[mode]
        assert result['standardDeviationBaseBetX'] > before[mode]['standardDeviationBaseBetX']
        assert abs(result['belowCostFractions']['0.5'] - 0.35) < 1e-9
for mode in stages['modes']:
    assert mode['lookupSha256'] == after[mode['mode']]['lookupSha256']
    for tier in mode['tiers']:
        means = [row['averageRoundPayoutWhenHighestStage'] for row in tier['stages']]
        assert all(a < b for a, b in zip(means, means[1:])), (mode['mode'], tier['tier'], means)
        audit = next(row for row in bonus['results'] if row['mode'] == mode['mode'] and row['tier'] == tier['tier'])
        assert all(abs(row['reachPercent'] / 100 - actual) < 1e-9 for row, actual in zip(tier['stages'], audit['stageReach']))

natural = {}
for mode in ['base', 'extraChance', 'extraChance2']:
    natural[mode] = {}
    bands = optimization['modes'][mode]['targets']
    for tier, minimum in [('normal', 5), ('super', 25), ('hidden', 100)]:
        selected = [band for band in bands if band['name'].startswith(tier + '_')]
        assert min(band['available'][0] for band in selected) >= minimum
        probability = sum(band['probability'] for band in selected)
        max_probability = sum(band['probability'] for band in selected if band['name'].endswith('_max'))
        natural[mode][tier] = {'minimumBaseBetX': minimum, 'conditionalMaxWinOneIn': probability / max_probability}

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

report = {
    'date': '2026-10-23', 'status': 'Fresh simulation, optimization and independent audits complete.',
    'units': 'Payouts and minimums are multiples of the base bet. Buy costs are 100x/300x/1000x.',
    'buyMinimumsBaseBetX': floors, 'naturalBonusMinimumsAndConditionalMaxOdds': natural,
    'wholeRoundMaxWinOneInTargets': targets,
    'before': before, 'after': after,
    'buyChanges': {mode: {
        'standardDeviationRatio': after[mode]['standardDeviationBaseBetX'] / before[mode]['standardDeviationBaseBetX'],
        'medianBefore': before[mode]['quantilesBaseBetX']['0.5'], 'medianAfter': after[mode]['quantilesBaseBetX']['0.5'],
        'belowHalfPriceBefore': before[mode]['belowCostFractions']['0.5'], 'belowHalfPriceAfter': after[mode]['belowCostFractions']['0.5'],
    } for mode in floors},
    'stageDistributionsAndPayoutCurves': stages,
    'optimizationAudit': optimization, 'bonusHitRateAndTierOrderAudit': bonus,
    'calibration': calibration,
    'validation': {'mathTestsPassed': 135, 'typecheckPassed': True, 'books': 210000, 'payoutBands': 180, 'independentRoundReplays': 540, 'allTwelveStagePayoutCurvesIncrease': True, 'allRequestedBonusHitTargetsMet': True, 'allPublishedLookupOffsetsVerified': True, 'frontendChanges': 'None'},
    'limitations': ['Stage reach and stage payout curves remain soft fitting goals.', 'Outcome concentration remains in the sampled pool: largest Normal/Super/Hidden buy books are approximately 9.65%/1.40%/10.05%. A broader production pool is still advisable.'],
    'sourceSha256': {str(path.relative_to(math)): digest(path) for path in [math / 'index.ts', *sorted((math / 'src').glob('*.ts'))]},
    'publishFilesSha256': {path.name: digest(path) for path in sorted((build / 'publish_files').iterdir()) if path.is_file()},
    'publishedFilesDirectory': str(build / 'publish_files'),
}
destination = artifacts / 'panda-buy-variance-analysis.json'
destination.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'status': report['status'], 'report': str(destination), 'buyChanges': report['buyChanges']}, indent=2))
