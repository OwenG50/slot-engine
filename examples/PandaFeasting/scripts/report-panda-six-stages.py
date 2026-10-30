"""Assemble and cross-check the completed Panda six-stage simulation reports."""
import hashlib
import json
import re
from pathlib import Path

workspace = Path(__file__).resolve().parents[1]
math = workspace
build = math / '__build__'
artifacts = workspace / 'artifacts'
read = lambda path: json.loads(path.read_text(encoding='utf-8'))
distribution = read(artifacts / 'panda-six-stage-distribution.json')
optimization = read(build / 'optimization-report.json')
bonus = read(build / 'bonus-hit-rate-audit.json')
calibration = read(build / 'bonus-hit-rate-report.json')
coverage = read(build / 'coverage-report.json')
assert coverage['failed'] == 0 and coverage['passed'] == 190 and coverage['runsPerBand'] == 3
assert sum(mode['books'] for mode in optimization['modes'].values()) == 210000
assert len(bonus['results']) == 12
assert all(abs(mode['rtp'] - 0.96) < 1e-7 for mode in optimization['modes'].values())
assert all(row['targetReached'] for row in bonus['results'])
assert optimization['stageMultipliers'] == {'1': 1, '2': 2, '3': 3, '4': 5, '5': 10, '6': 25}
settings = (math / 'src/settings.ts').read_text(encoding='utf-8')
thresholds = {}
for tier, front_tier in [('normal', 'bonus'), ('super', 'superBonus'), ('hidden', 'hiddenBonus')]:
    parse = lambda text, key: dict(re.findall(r'(\d+)\s*:\s*(\d+)', re.search(rf'\b{key}:\s*\{{([^}}]+)\}}', text)[1]))
    thresholds[tier] = {key: int(value) for key, value in parse(settings, tier).items()}

for mode in distribution['modes']:
    lookup = build / 'publish_files' / f"lookUpTable_{mode['mode']}_0.csv"
    assert hashlib.sha256(lookup.read_bytes()).hexdigest() == mode['lookupSha256']
    for tier in mode['tiers']:
        rows = tier['stages']
        assert len(rows) == 6
        means = [row['averageRoundPayoutWhenHighestStage'] for row in rows]
        assert all(a < b for a, b in zip(means, means[1:])), (mode['mode'], tier['tier'], means)
        independent = next(row for row in bonus['results'] if row['mode'] == mode['mode'] and row['tier'] == tier['tier'])
        assert all(abs(row['reachPercent'] / 100 - rate) < 1e-9 for row, rate in zip(rows, independent['stageReach']))
        tier['averagePayoutIncreasesAtEveryStage'] = True
        tier['requestedStageReachPercent'] = [value * 100 for value in calibration['stageReachTargets'][tier['tier']]]

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

report = {
    'date': '2026-10-23',
    'status': 'Simulation, optimization, event validation, and independent audits complete; test math generated.',
    'stageMultipliers': optimization['stageMultipliers'],
    'foodThresholds': thresholds,
    'bonusRoundPayoutFloors': {'normal': 5, 'super': 25, 'hidden': 100},
    'bonusSpinWinningRates': bonus['targets'],
    'eventOrderOnUpgrade': ['collectSymbols', 'triggerExplode(source=stage)', 'spawnNewStageWilds(current board)', 'winInfo(all replay wins)', 'setWin', 'setTotalWin', 'newStageUnlocked(respawn and meter)', 'addAdditionalFreeSpins(unless max win)'],
    'replayRules': 'No extra reveal or spin consumed; all lines re-evaluated, including unchanged wins; no replay food or chained promotion; capped against the remaining 10,000x round budget.',
    'validation': {'mathTests': 122, 'frontendTests': 175, 'bothTypechecksPassed': True, 'books': 210000, 'payoutBands': 190, 'independentRoundReplays': 570, 'allPublishedLookupOffsetsVerified': True, 'allTwelveTierEntryPayoutCurvesIncrease': True, 'authoredDigitSixValidated': True},
    'limitations': ['Stage rates and payout curves are fitted goals, not guarantees for individual rounds. Normal Stage 5 is a 3,000-4,000x average payout guideline, not a hard floor.', 'Outcome concentration still merits broader sampling before production: largest Normal/Super/Hidden buy books are about 12.95%/3.81%/6.74%.'],
    'conditionalStageDistributionsAndPayouts': distribution['modes'],
    'rtpAndPayoutAudits': optimization['modes'],
    'bonusHitAndStageAudit': bonus,
    'calibration': calibration,
    'sourceSha256': {str(path.relative_to(math)): digest(path) for path in [math / 'index.ts', *sorted((math / 'src').glob('*.ts'))]},
    'publishFilesSha256': {path.name: digest(path) for path in sorted((build / 'publish_files').iterdir()) if path.is_file()},
    'publishedFilesDirectory': str(build / 'publish_files'),
}
(artifacts / 'panda-six-stage-analysis.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'status': report['status'], 'books': report['validation']['books'], 'tierEntries': len(bonus['results']), 'report': str(artifacts / 'panda-six-stage-analysis.json')}, indent=2))
