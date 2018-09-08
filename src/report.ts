import * as fs from 'fs-extra';
import * as glob from 'glob';

import {countBy, sortBy, uniqBy, values} from 'lodash';
import * as Path from 'path';
import {IOptions, IRule, loadRules} from 'tslint';
// tslint:disable-next-line:no-submodule-imports
import {loadConfigurationFromPath} from 'tslint/lib/configuration';

import {DOCS, TSLINT} from './constants';
import {DEPRECATED} from './ExtendedMetadata';
import {fsToRuleData, isRuleFromFS, pathToRuleFromFS} from './RuleFromFS';
import {ActiveRule, Dict, PackageJson, RuleData, Source} from './types';

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

export type SourceTuple = [string, string];
const createSourcesOrder = (rules: ReadonlyArray<RuleData>): ReadonlyArray<SourceTuple> => {
  const unordered = uniqBy(rules, r => r.source)
    .map<SourceTuple>(r => [r.source, r.sourcePath]);
  // TODO sort by order defined in config files? (issue #2)
  const tslint = unordered.find(([source]) => source === TSLINT);

  return tslint ? [
    tslint, // rules from tslint take precedence
    ...unordered.filter(it => it !== tslint)
  ] : unordered;
};

const sourcesOrder = createSourcesOrder(rules);

const tupleToSources = (
  {readJsonSync}: Pick<typeof fs, 'readJsonSync'> = fs
) => (
  sources: Dict<Source>, [source, sourcePath]: SourceTuple
) => {
  const {
    _from, _resolved, bugs, deprecated, description, homepage, main, peerDependencies
  } = readJsonSync(Path.join(sourcePath, 'package.json')) as PackageJson;

  sources[sourcePath] = {
    _from,
    _resolved,
    bugs,
    deprecated,
    description,
    docs: source in DOCS ? DOCS[source as keyof typeof DOCS] : 'unknown',
    homepage,
    main,
    name: source,
    path: sourcePath,
    peerDependencies
  };
  return sources;
};

const sources = sourcesOrder.reduce<Dict<Source>>(tupleToSources(), {});

const rulesAvailable = sortBy(
  rules, ['ruleName', (r: RuleData) => sourcesOrder.findIndex(([source]) => r.source === source)])
  .reduce<Dict<RuleData>>(
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

const loadRulesFromConfig = (
  tslint_loadConfig = loadConfigurationFromPath, tslint_loadRules = loadRules
) => (
  configFile: string
) => {
  const rulesFromConfig = tslint_loadConfig(configFile, configFile);
  const namedRules: IOptions[] = [];
  rulesFromConfig.rules.forEach((option, key) => {
    // console.log(key, JSON.stringify(option));
    namedRules.push({...(option as IOptions), ruleName: key});
  });
  return sortBy(tslint_loadRules(namedRules, rulesFromConfig.rulesDirectory), 'ruleName');
};

const loadedRules = loadRulesFromConfig()(Path.join(CWD, 'tslint.json'));

/**
 sometimes deprecation message is an empty string, which still means deprecated,
 tslint-microsoft-contrib sets the group metadata to 'Deprecated' instead
*/
const deprecation = (
  deprecationMessage: string | undefined, group: string | undefined
): string | boolean => {
  if (deprecationMessage !== undefined) {
    return deprecationMessage || true;
  }
  return group === DEPRECATED;
};

const loadedToActiveRules = (report: Dict<ActiveRule>, rule: IRule) => {
  const {ruleName, ruleArguments, ruleSeverity} = rule.getOptions();
  const ruleData = rulesAvailable[ruleName];
  if (!ruleData) {
    console.log('Rule not found as available', ruleName);
    report[ruleName] = {
      ruleName,
      ruleArguments,
      ruleSeverity
    };
  } else {
    const {
      deprecationMessage, documentation, hasFix, group, source, sameName, type
    } = ruleData;
    const deprecated = deprecation(deprecationMessage, group);
    report[ruleName] = {
      ruleName,
      ruleSeverity,
      source,
      ...(deprecated && {deprecated}),
      ...(documentation && {documentation}),
      ...(hasFix && {hasFix}),
      ...(group && {group}),
      ...(type && {type}),
      ...(ruleArguments && {ruleArguments}),
      ...(sameName && {sameName: sameName.map(r => r.id)})
    };
  }
  return report;
};

const report = loadedRules.reduce<Dict<ActiveRule>>(loadedToActiveRules, {});

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
