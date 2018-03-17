import * as fs from 'fs-extra';
import * as glob from 'glob';

import {kebabCase, sortBy, sortedUniqBy, values} from 'lodash';
import * as Path from 'path';
import {IOptions, loadRules, Rules} from 'tslint';
// tslint:disable-next-line:no-submodule-imports
import {loadConfigurationFromPath} from 'tslint/lib/configuration';
import {DEPRECATED} from './ExtendedMetadata';
import {ActiveRule, Dict, PackageJson, ReportData, RuleData, RuleMetadata, Source} from './types';

const RULE_PATTERN = '{RULE}';

const DOCS = {
  tslint: `https://palantir.github.io/tslint/rules/${RULE_PATTERN}`,
  'tslint-eslint-rules': `https://eslint.org/docs/rules/${RULE_PATTERN}`,
  'tslint-microsoft-contrib':
    'https://github.com/Microsoft/tslint-microsoft-contrib#supported-rules',
  'tslint-react': 'https://github.com/palantir/tslint-react#rules',
  'bm-tslint-rules': 'https://github.com/bettermarks/bm-tslint-rules#rules'
};

const NODE_MODULES = 'node_modules';
const CWD = process.cwd();

// const ruleSets = walk(process.cwd(), {nodir: true, filter: findRuleSets}).map(item => item.path);
const ruleId = ({ruleName, sourcePath}: ReportData) => `${sourcePath}:${ruleName}`;

const rules = glob.sync('*Rule.js', {
  nodir: true, matchBase: true, absolute: true, ignore: ['**/tslint/lib/language/**', '**/Rule.js']
});
const rulesAvailable = rules.reduce<Dict<RuleData>>(
  // tslint:disable-next-line:cyclomatic-complexity
  (dict, path) => {
    let stripped;
    try {
      // tslint:disable-next-line:no-non-null-assertion
      stripped = /\/(\w+)Rule\..*/.exec(path)![1];
    } catch (error) {
      console.log(path, error);
      return dict;
    }

    // kebabCase from ladash is not compatible with tslint's name conversion
    // so we eed to remove the '-' sign before and after the 11
    // that are added by kebabCase for all the
    // react-a11y-* rules from tslint-microsoft-contrib
    // tslint:disable-next-line:no-non-null-assertion
    const ruleName = kebabCase(stripped).replace(/-11-/, '11');

    const relativePath = path.replace(CWD, `.`);
    const paths = relativePath.split(Path.sep);
    const indexOfSource = paths.lastIndexOf(NODE_MODULES) + 1;
    const inInNodeModules = indexOfSource > 0;
    const sourcePath = inInNodeModules ?
      paths.slice(0, indexOfSource + 1).join(Path.sep) : '.';
    const source = Path.basename(inInNodeModules ? sourcePath : CWD);

    // tslint:disable-next-line:non-literal-require
    const {Rule} = require(path);
    if (!(Rule && Rule instanceof Rules.AbstractRule.constructor)) return dict;

    /*
        if (!Rule.metadata) {
          console.warn('no metadata found in rule', sourcePath, ruleName);
        }
    */
    const documentation = (source in DOCS ? DOCS[source as keyof typeof DOCS] : '')
      .replace(new RegExp(RULE_PATTERN, 'g'), ruleName);

    const metadata: RuleMetadata = Rule.metadata ? Rule.metadata : {ruleName: ruleName};
    if (!metadata.options) {
      delete metadata.options;
      delete metadata.optionsDescription;
      delete metadata.optionExamples;
    }

    const data: RuleData = {
      ...metadata,
      ...(documentation ? {documentation} : {}),
      path: relativePath,
      source,
      sourcePath
    };

    const existing = dict[ruleName];
    if (existing) {
      // there is another rule with the same name
      const currentId = ruleId(data);
      const existingId = ruleId(existing);
      if (source === 'tslint') {
        // the current one wins because custom rules can not override tslint rules
        data.sameName = [...(existing.sameName ? existing.sameName : []), existingId];
        dict[existingId] = existing;
        dict[ruleName] = data;
      } else {
        // non deterministic which one wins
        if (existing.source !== 'tslint') {
          console.log(
            `rule name '${ruleName}' used different sources (first extend wins)`
          );
        }
        // we keep the one in dict, point to the conflict and only store the current one under ID
        existing.sameName = [...(existing.sameName ? existing.sameName : []), currentId];
        dict[currentId] = data;
      }
    } else {
      dict[ruleName] = data;
    }
    return dict;
  },
  {}
);

const reportAvailable: any = {};
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

// reportAvailable.$sources = sources;

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

// const tslintJson = findConfiguration('tslint.json').results;
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
    deprecationMessage, group, source, sameName
  } = ruleData;

  // sometimes deprecation message is an empty string, which still means deprecated,
  // tslint-microsoft-contrib sets the group metadata to 'Deprecated' instead
  const deprecated = deprecationMessage !== undefined || (group && group === DEPRECATED);
  if (deprecated) {
    console.warn(`WARNING: The deprecated rule '${ruleName}' from '${source}' is active.`);
  }

  report[ruleName] = {
    ...(deprecated && {deprecated: deprecationMessage || true}),
    ...(ruleArguments && ruleArguments.length && {ruleArguments}),
    ruleSeverity,
    source,
    ...(source !== 'tslint' && sameName && sameName.length && {sameName})
  };
});

fs.writeJSONSync('tslint.report.active.json', report, {spaces: 2});
console.log('active rules:', loadedRules.length);
