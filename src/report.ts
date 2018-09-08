import * as fs from 'fs-extra';
import * as glob from 'glob';

import {kebabCase, sortBy, sortedUniqBy, values, countBy, uniqBy} from 'lodash';
import * as Path from 'path';
import {IOptions, loadRules, Rules} from 'tslint';
// tslint:disable-next-line:no-submodule-imports
import {loadConfigurationFromPath} from 'tslint/lib/configuration';
import {DEPRECATED} from './ExtendedMetadata';
import {
  ActiveRule,
  Dict,
  PackageJson,
  ReportData,
  RuleData,
  RuleMetadata,
  RuleName,
  Source
} from './types';

const RULE_PATTERN = '{RULE}';

// tslint:disable-next-line:no-var-requires
const DOCS: Dict<string> = require('../rules.docs.json');

const NODE_MODULES = 'node_modules';
const TSLINT = `tslint`;
const CWD = process.cwd();

// const ruleSets = walk(process.cwd(), {nodir: true, filter: findRuleSets}).map(item => item.path);
const ruleId = (
  {ruleName, sourcePath}: {ruleName: string; sourcePath: string}
) => `${sourcePath}:${ruleName}`;

type Raw = ReportData & RuleName & {
  metadata?: any;
};

const rules: ReadonlyArray<RuleData> = glob
// everything ending with Rule.js could be a tslint rule
  .sync('*Rule.js', {
    nodir: true, matchBase: true, absolute: true, ignore: [
      // there are some problematic exceptions
      '**/tslint/lib/language/**', '**/Rule.js'
    ]
  })
  .map((path): Raw | undefined => {
    let stripped;
    try {
      // tslint:disable-next-line:no-non-null-assertion
      stripped = /\/(\w+)Rule\..*/.exec(path)![1];
    } catch (error) {
      console.log(path, error);
      return;
    }

    // kebabCase from ladash is not compatible with tslint's name conversion
    // so we need to remove the '-' sign before and after the 11
    // that are added by kebabCase for all the
    // react-a11y-* rules from tslint-microsoft-contrib
    const ruleName = kebabCase(stripped).replace(/-11-/, '11');

    const relativePath = path.replace(CWD, `.`);
    const paths = relativePath.split(Path.sep);
    const indexOfSource = paths.lastIndexOf(NODE_MODULES) + 1;
    const isInNodeModules = indexOfSource > 0;
    const sourcePath = isInNodeModules ?
      paths.slice(0, indexOfSource + 1).join(Path.sep) : '.';
    const source = Path.basename(isInNodeModules ? sourcePath : CWD);

    // tslint:disable-next-line:non-literal-require
    const {Rule} = require(path);
    if (!(Rule && Rule instanceof Rules.AbstractRule.constructor)) return;

    return {
      id: ruleId({ruleName, sourcePath}),
      ruleName,
      path: relativePath,
      metadata: Rule.metadata,
      source,
      sourcePath
    };
  })
  .filter((r): r is Raw => r !== undefined)
  .map(({metadata, ruleName, source, sourcePath, ...data}) => {
    if (!metadata) {
      console.log('no metadata found in rule', sourcePath, ruleName);
    }
    const documentation = (source in DOCS ? DOCS[source as keyof typeof DOCS] : '')
      .replace(new RegExp(RULE_PATTERN, 'g'), ruleName);

    const meta: RuleMetadata = metadata ? metadata : {ruleName: ruleName};
    if (!meta.options) {
      delete meta.options;
      delete meta.optionsDescription;
      delete meta.optionExamples;
    }
    if (meta.ruleName !== ruleName) {
      console.log(
        'mismatching ruleName from file and metadata.ruleName:',
        {ruleName, ['metadata.ruleName']: meta.ruleName}
      );
      // we expect this mismatch to be not by intention, so get rid of it
      delete meta.ruleName;
    }

    return {
      ruleName,
      source,
      ...data,
      ...meta,
      ...(documentation && {documentation}),
      sourcePath
    };
  });

const sourcesOrder = [
  TSLINT, // rules from tslint can not be overridden
  ...uniqBy(rules, r => r.source)
  .map(r => r.source)
  .filter(s => s === TSLINT)
];

const rulesAvailable = sortBy(
  rules, ['ruleName', (r: RuleData) => sourcesOrder.indexOf(r.source)])
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

const reportAvailable: Dict<ReportData> = {};
const sources: Dict<Source> = {};
sortedUniqBy<RuleData>(values(rulesAvailable), 'sourcePath')
  .forEach(({source, sourcePath}) => {
    const {
      _from, _resolved, bugs, deprecated, description, homepage, main, peerDependencies
    } = fs.readJsonSync(Path.join(sourcePath, 'package.json')) as PackageJson;

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
  });

sortBy(Object.keys(rulesAvailable)).forEach(key => {
  const rule = {...rulesAvailable[key]};
  const {ruleName, ...ruleData} = rule;
  reportAvailable[key] = ruleData;
});
console.log(
  `${rules.length} rules available from ${Object.keys(sources).length} sources:`,
  JSON.stringify(Object.keys(sources), undefined, 2)
);
fs.writeJSONSync('tslint.report.sources.json', sources, {spaces: 2});
fs.writeJSONSync('tslint.report.available.json', reportAvailable, {spaces: 2});

const configFile = Path.join(CWD, 'tslint.json');

const rulesFromConfig = loadConfigurationFromPath(configFile, configFile);
const namedRules: IOptions[] = [];
rulesFromConfig.rules.forEach((option, key) => {
  // console.log(key, JSON.stringify(option));
  namedRules.push({...(option as IOptions), ruleName: key});
});
const loadedRules = loadRules(namedRules, rulesFromConfig.rulesDirectory);
const report: Dict<ActiveRule> = {};

// tslint:disable-next-line:cyclomatic-complexity
sortBy(loadedRules, 'ruleName').forEach((rule) => {
  const {ruleName, ruleArguments, ruleSeverity} = rule.getOptions();
  if (!(ruleName in rulesAvailable)) {
    report[ruleName] = {
      ruleArguments,
      ruleSeverity
    };
    console.log('Rule not found as available', ruleName);
    return;
  }
  const ruleData = rulesAvailable[ruleName];
  const {
    deprecationMessage, documentation, hasFix, group, source, sameName, type
  } = ruleData;

  // sometimes deprecation message is an empty string, which still means deprecated,
  // tslint-microsoft-contrib sets the group metadata to 'Deprecated' instead
  const deprecated = deprecationMessage !== undefined || (group && group === DEPRECATED);
  if (deprecated) {
    console.warn(`WARNING: The deprecated rule '${ruleName}' from '${source}' is active.`);
  }

  report[ruleName] = {
    ...(deprecated && {deprecated: deprecationMessage || true}),
    ...(documentation && {documentation}),
    ...(hasFix && {hasFix}),
    ...(group && {group}),
    ...(type && {type}),
    ...(ruleArguments && ruleArguments.length && {ruleArguments}),
    ruleSeverity,
    source,
    ...(source !== TSLINT && sameName && {sameName: sameName.map(r => r.id)})
  };
});

fs.writeJSONSync('tslint.report.active.json', report, {spaces: 2});
console.log('active rules:', loadedRules.length);
const reportBy = (key: keyof ActiveRule) =>
  console.log(`by ${key}:\n${
  JSON.stringify(countBy(report, key), null, 2).replace(/[{}]/g, '')}`);

reportBy('type');
reportBy('group');
