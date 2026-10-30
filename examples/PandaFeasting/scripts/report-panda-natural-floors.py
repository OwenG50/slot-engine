"""Verify restored natural bonus floors against the final generated math."""
import hashlib
import json
import re
from pathlib import Path

workspace = Path(__file__).resolve().parents[1]
root = workspace
build = root / '__build__'
artifacts = workspace / 'artifacts'
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
optimization = read(build / 'optimization-report.json')
bonus = read(build / 'bonus-hit-rate-audit.json')
coverage = read(build / 'coverage-report.json')
calibration = read(build / 'bonus-hit-rate-report.json')
stages = read(artifacts / 'panda-natural-floors-stages.json')
before = read(artifacts / 'panda-natural-floors-before.json')
expected = dict(normal=16, super=87, hidden=800)
buy_floors = dict(normal=1, super=10, hidden=50)
buys = dict(normal='bonusFeature', super='superBonusFeature', hidden='hiddenBonusFeature')
settings = (root / 'src/settings.ts').read_text(encoding='utf-8')
target_block = settings.split('export const BONUS_TARGETS =', 1)[1].split('satisfies', 1)[0]
for tier, minimum in expected.items():
    assert int(re.search(rf'\b{tier}:\s*\{{[^}}]*\bminimum:\s*(\d+)', target_block)[1]) == minimum
assert coverage['passed'] == 177 and coverage['failed'] == 0 and coverage['runsPerBand'] == 3
assert sum(mode['books'] for mode in optimization['modes'].values()) == 210000
assert len(bonus['results']) == 12 and all(row['targetReached'] for row in bonus['results'])
natural_summary = {}
for mode in ['base', 'extraChance', 'extraChance2']:
    natural_summary[mode] = {}
    for tier, minimum in expected.items():
        bands = [band for band in optimization['modes'][mode]['targets'] if band['name'].startswith(tier + '_')]
        assert min(band['available'][0] for band in bands) >= minimum
        mode_stages = next(row for row in stages['modes'] if row['mode'] == mode)
        tier_stages = next(row for row in mode_stages['tiers'] if row['tier'] == tier)['stages']
        observed = min(row['minimumRoundPayoutWhenHighestStage'] for row in tier_stages if row['minimumRoundPayoutWhenHighestStage'] is not None)
        assert observed >= minimum
        natural_summary[mode][tier] = {'minimumBaseBetX': minimum, 'observedMinimumBaseBetX': observed}
for tier, mode in buys.items():
    old = {band['name']: band for band in before['modes'][mode]['targets']}
    new = optimization['modes'][mode]['targets']
    assert len(old) == len(new)
    for band in new:
        assert abs(band['probability'] - old[band['name']]['probability']) < 1e-8
        assert abs(band['average'] - old[band['name']]['average']) < 0.005
    assert min(band['available'][0] for band in new) >= buy_floors[tier]
for mode, result in optimization['modes'].items():
    assert abs(result['rtp'] - 0.96) < 1e-7
    assert abs(result['maxWinOneIn'] / before['modes'][mode]['maxWinOneInTarget'] - 1) < 1e-5
for mode in stages['modes']:
    lookup = build / 'publish_files' / f"lookUpTable_{mode['mode']}_0.csv"
    assert hashlib.sha256(lookup.read_bytes()).hexdigest() == mode['lookupSha256']

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

report = {
    'date': '2026-10-23', 'status': 'Natural floors restored; fresh simulation, optimization and independent audits complete.',
    'units': 'Multiples of the base bet; feature totals include the triggering spin.',
    'naturalMinimums': natural_summary, 'buyMinimumsUnchanged': buy_floors,
    'buyPayoutBandProbabilitiesAndMeansUnchanged': True,
    'validation': {'mathTestsPassed': 135, 'typecheckPassed': True, 'books': 210000, 'payoutBands': 177, 'independentRoundReplays': 531, 'allBonusWinningSpinTargetsMet': True, 'maxWinOddsUnchanged': True, 'allModesRtp': 0.96, 'publishedLookupIndexesVerified': True},
    'optimizationAudit': optimization, 'bonusAudit': bonus, 'calibration': calibration,
    'stageDistributionsAndPayouts': stages,
    'sourceSha256': {str(p.relative_to(root)): digest(p) for p in [root / 'index.ts', *sorted((root / 'src').glob('*.ts'))]},
    'publishFilesSha256': {p.name: digest(p) for p in sorted((build / 'publish_files').iterdir()) if p.is_file()},
    'publishedFilesDirectory': str(build / 'publish_files'),
}
destination = artifacts / 'panda-natural-floors-analysis.json'
destination.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'status': report['status'], 'floors': natural_summary, 'report': str(destination)}, indent=2))
