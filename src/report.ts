import * as fs from 'fs-extra';
import * as glob from 'glob';

import {kebabCase, sortBy} from 'lodash';
import * as Path from 'path';
import {IOptions, IRuleMetadata, loadRules} from 'tslint';
import {loadConfigurationFromPath} from 'tslint/lib/configuration';

/*
const DOCS = {
  tslint: 'https://palantir.github.io/tslint/rules/',
  'tslint-eslint-rules': 'https://eslint.org/docs/rules/',
  'tslint-microsoft-contrib':
    'https://github.com/Microsoft/tslint-microsoft-contrib#supported-rules'
  ,
  'tslint-react': 'https://github.com/palantir/tslint-react#rules',
  'bm-tslint-rules': 'https://github.com/bettermarks/bm-tslint-rules#rules'
};
*/

// const isPackage = (item: Item) => item.path.endsWith('package.json');
const NODE_MODULES = 'node_modules';
/*
const packages = walk(NODE_MODULES, {nodir: true, filter: isPackage}).map(item => item.path);

const findRuleSets = (item: Item): boolean => {
  if (Path.extname(item.path) !== '.json') return false;
  if (Path.basename(item.path)[0] === '.') return false;
  if (isPackage(item)) return false;
  if (item.path.endsWith('package-lock.json')) return false;
  if (item.path.indexOf('/@types/') > -1) return false;

  try {
    const config = loadConfigurationFromPath(item.path);
    return config !== DEFAULT_CONFIG && config !== EMPTY_CONFIG && 'rules' in config;
  } catch (error) {
    // console.log(item.path, error);
    return false;
  }
};
*/
const CWD = process.cwd();
type RuleData = Partial<IRuleMetadata> & {ruleName: string, source: string, sameName?: string[]};
// const ruleSets = walk(process.cwd(), {nodir: true, filter: findRuleSets}).map(item => item.path);
const ruleId = ({ruleName, source}: RuleData) => `${source}:${ruleName}`;

const rules = glob.sync('*Rule.js', {
  nodir: true, matchBase: true, absolute: true, ignore: '**/tslint/lib/language/**'
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
    // tslint:disable-next-line:no-non-null-assertion
    const ruleName = kebabCase(stripped).replace(/-11-/, '11');

    const paths = path.split(Path.sep);
    const indexOf = paths.lastIndexOf(NODE_MODULES);
    const source = indexOf > -1 ? paths[indexOf + 1] : path;

    // tslint:disable-next-line:non-literal-require
    const {Rule} = require(path);
    const data: RuleData = Rule && Rule.metadata ? Rule.metadata : {ruleName: ruleName};
    data.source = source;

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
console.log(`found ${rules.length} rules`);

const reportAvailable: any = {};
// tslint:disable-next-line
sortBy(Array.from(rulesAvailable.keys())).forEach((key) => {
  const rule = {...rulesAvailable.get(key)!}; // tslint:disable-line:no-non-null-assertion
  delete rule.ruleName;
  reportAvailable[key] = rule;
});
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
  const {
    deprecationMessage, source, sameName
  } = rulesAvailable.get(ruleName)!; // tslint:disable-line:no-non-null-assertion

  report[ruleName] = {
    ...(deprecationMessage && {deprecated: deprecationMessage}),
    ...(ruleArguments && ruleArguments.length && {ruleArguments}),
    ruleSeverity,
    source,
    ...(source !== 'tslint' && sameName && sameName.length && {sameName})
  };
});

fs.writeJSONSync('tslint.report.active.json', report, {spaces: 2});
console.log('active rules:', loadedRules.length);
