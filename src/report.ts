import * as fs from 'fs-extra';
import * as glob from 'glob';

import {kebabCase, sortBy, sortedUniqBy} from 'lodash';
import * as Path from 'path';
import {ExtendedMetadata, DEPRECATED} from './ExtendedMetadata';
import {IOptions, IRuleMetadata, loadRules, Rules} from 'tslint';
// tslint:disable-next-line:no-submodule-imports
import {loadConfigurationFromPath} from 'tslint/lib/configuration';

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

type ReportData = {
  documentation?: string;
  path: string;
  ruleName: string;
  source: string;
  sourcePath: string;
  sameName?: string[];
};
type RuleMetadata = Partial<IRuleMetadata & ExtendedMetadata> & {
  ruleName: string;
};
type RuleData = RuleMetadata & ReportData;

// const ruleSets = walk(process.cwd(), {nodir: true, filter: findRuleSets}).map(item => item.path);
const ruleId = ({ruleName, sourcePath}: ReportData) => `${sourcePath}:${ruleName}`;

const rules = glob.sync('*Rule.js', {
  nodir: true, matchBase: true, absolute: true, ignore: ['**/tslint/lib/language/**', '**/Rule.js']
});
const rulesAvailable = rules.reduce(
  // tslint:disable-next-line:cyclomatic-complexity
  (map, path) => {
    let stripped;
    try {
      // tslint:disable-next-line:no-non-null-assertion
      stripped = /\/(\w+)Rule\..*/.exec(path)![1];
    } catch (error) {
      console.log(path, error);
      return map;
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
    if (!(Rule && Rule instanceof Rules.AbstractRule.constructor)) return map;

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

    const existing = map.get(ruleName);
    if (existing) {
      // there is another rule with the same name
      const currentId = ruleId(data);
      const existingId = ruleId(existing);
      if (source === 'tslint') {
        // the current one wins because custom rules can not override tslint rules
        data.sameName = [...(existing.sameName ? existing.sameName : []), existingId];
        map.set(existingId, existing);
        map.set(ruleName, data);
      } else {
        // non deterministic which one wins
        if (existing.source !== 'tslint') {
          console.warn(
            `rules with same name '${ruleName}' from different sources`,
            [existingId, currentId]
          );
        }
        // we keep the one in the map, point to the conflict and only store the current one under ID
        existing.sameName = [...(existing.sameName ? existing.sameName : []), currentId];
        map.set(currentId, data);
      }
    } else {
      map.set(ruleName, data);
    }
    return map;
  },
  new Map<string, RuleData>()
);

type PackageJson = {
  _from: string;
  _resolved: string;
  bugs?: { url: string };
  deprecated: boolean;
  description: string;
  homepage?: string;
  main: string;
  peerDependencies: {
    tslint?: string;
    typescript?: string;
  };
};

type Source = PackageJson & {
  name: string;
  path: string;
  docs: string;
};

const reportAvailable: any = {};
const sources: ReadonlyArray<Source> = sortedUniqBy<RuleData>(
  Array.from(rulesAvailable.values()), 'sourcePath'
).map(({source, sourcePath}): Source => {
  const {
    _from, _resolved, bugs, deprecated, description, homepage, main, peerDependencies
  } = fs.readJsonSync(Path.join(sourcePath, 'package.json')) as PackageJson;

  return ({
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
  });
});

reportAvailable.$sources = sortBy(sources, 'name');

// tslint:disable-next-line
sortBy(Array.from(rulesAvailable.keys())).forEach((key) => {
  // tslint:disable-next-line:no-non-null-assertion since we are iterating keys
  const rule = {...rulesAvailable.get(key)!};
  const {ruleName, ...ruleData} = rule;
  reportAvailable[key] = ruleData;
});
console.log(
  `${rules.length} rules available from ${sources.length} sources:`,
  JSON.stringify(sources.map(source => source.path), undefined, 2)
);
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
const report: any = {};

// tslint:disable-next-line:cyclomatic-complexity
sortBy(loadedRules, 'ruleName').forEach((rule) => {
  const {ruleName, ruleArguments, ruleSeverity} = rule.getOptions();

  if (!rulesAvailable.has(ruleName)) {
    report[ruleName] = {
      ruleArguments,
      ruleSeverity
    };
    console.log('Rule not found as available', ruleName);
    return;
  }
  const ruleData = rulesAvailable.get(ruleName)!; // tslint:disable-line:no-non-null-assertion
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
