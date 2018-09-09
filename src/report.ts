import * as fs from 'fs-extra';
import * as glob from 'glob';
import {countBy, sortBy, values} from 'lodash';
import * as Path from 'path';

import {TSLINT} from './constants';
import {fsToRuleData, isRuleFromFS, pathToRuleFromFS} from './RuleFromFS';
import {ActiveRule, loadedToActiveRules, loadRulesFromConfig} from './RuleFromTslint';
import {createSourcesOrder, indexInSourceOrder, tupleToSources} from './sources';
import {Dict, RuleData, Source} from './types';

const CWD = process.cwd();

const rules: ReadonlyArray<RuleData> = glob
// everything ending with Rule.js could be a tslint rule
  .sync('*Rule.js', {
    cwd: CWD, nodir: true, matchBase: true, absolute: true, ignore: [
      // there are some problematic exceptions
      '**/tslint/lib/language/**', '**/Rule.js'
    ]
  })
  .map(pathToRuleFromFS(CWD))
  .filter(isRuleFromFS)
  .map(fsToRuleData);

const sourcesOrder = createSourcesOrder(rules);
const sources = sourcesOrder.reduce<Dict<Source>>(tupleToSources(), {});

const rulesAvailable = sortBy<RuleData>(
  rules, ['ruleName', indexInSourceOrder(sourcesOrder)]
).reduce<Dict<RuleData>>(
  (dict, rule) => {
    const {ruleName} = rule;

    const existing = dict[ruleName];
    if (existing) {
      if (existing.source !== TSLINT && !existing.sameName) {
        console.log(
          `rule name '${ruleName}' available from different sources (first extend wins)`
        );
      }
      existing.sameName = [...(existing.sameName ? existing.sameName : []), rule];
    } else {
      dict[ruleName] = rule;
    }
    return dict;
  },
  {}
);

console.log(
  `${rules.length} rules available from ${Object.keys(sources).length} sources:`,
  JSON.stringify(Object.keys(sources), undefined, 2)
);
fs.writeJSONSync('tslint.report.sources.json', sources, {spaces: 2});
fs.writeJSONSync('tslint.report.available.json', rulesAvailable, {spaces: 2});

const loadedRules = loadRulesFromConfig()(Path.join(CWD, 'tslint.json'));

const report = loadedRules.reduce<Dict<ActiveRule>>(loadedToActiveRules(rulesAvailable), {});

values(report)
  .filter(r => r.deprecated)
  .forEach(({ruleName, source}) => {
    console.warn(`WARNING: The deprecated rule '${ruleName}' from '${source}' is active.`);
  });

fs.writeJSONSync('tslint.report.active.json', report, {spaces: 2});
console.log('active rules:', loadedRules.length);

const reportBy = (key: keyof ActiveRule) => console.log(
  `by ${key}:\n${JSON.stringify(countBy(report, key), null, 2).replace(/[{}]/g, '')}`
);
reportBy('type');
reportBy('group');
