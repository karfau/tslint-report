import * as fs from 'fs-extra';
import * as walk from 'klaw-sync';
import {Item} from 'klaw-sync';
import {kebabCase} from 'lodash';
import * as Path from 'path';
import {IOptions, IRuleMetadata, loadRules} from 'tslint';
import {loadConfigurationFromPath} from 'tslint/lib/configuration';

/*
const DOCS = {
  tslint: ['CORE', 'https://palantir.github.io/tslint/rules/'],
  'tslint-eslint-rules': ['ESLINT', 'https://eslint.org/docs/rules/'],
  'tslint-microsoft-contrib': [
    'MSC',
    'https://github.com/Microsoft/tslint-microsoft-contrib#supported-rules'
  ],
  'tslint-react': ['REACT', 'https://github.com/palantir/tslint-react#rules'],
  'bm-tslint-rules': ['BM', 'https://github.com/bettermarks/bm-tslint-rules#rules']
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

const findRules = (item: Item): boolean => {
  const ext = Path.extname(item.path);
  if (ext !== '.js') return false;
  const base = Path.basename(item.path);
  if (base[0] === '.') return false;
  if (item.path.indexOf('tslint/lib/language') > -1) return false;
  const fileName = base.substr(0, base.length - ext.length);
  // console.log(item.path, fileName);
  if (fileName.endsWith('Rule')) return true;

  return false;
};
type RuleData = Partial<IRuleMetadata> & {ruleName: string, source: string};
// const ruleSets = walk('.', {nodir: true, filter: findRuleSets}).map(item => item.path);
const rules = walk('.', {nodir: true, filter: findRules}).map(item => item.path);
const rulesAvailable = rules.reduce(
  (map, path) => {
    // tslint:disable-next-line:no-non-null-assertion
    const stripped = /\/(\w+)Rule\..*/.exec(path)![1];
    const ruleName = kebabCase(stripped).replace(/-11-/, '11');

    const paths = path.split(Path.sep);
    const indexOf = paths.indexOf(NODE_MODULES);
    const source = indexOf > -1 ? paths[indexOf + 1] : path;

    // tslint:disable-next-line:non-literal-require
    const {Rule} = require(path);
    const data = Rule && Rule.metadata ? Rule.metadata : {ruleName: ruleName};

    return map.set(ruleName, {...data, source});
  },
  new Map<string, RuleData>()
);
console.log(`found ${rules.length} rules`);

const reportAvailable: any = {};
// tslint:disable-next-line
rulesAvailable.forEach((rule, key) => {
  delete rule.ruleName;
  reportAvailable[key] = rule;
});
fs.writeJSONSync('available-rules,json', reportAvailable, {spaces: 2});


// const tslintJson = findConfiguration('tslint.json').results;
const rulesFromConfig = loadConfigurationFromPath('./tslint.json', './tslint.json');
const namedRules: IOptions[] = [];
rulesFromConfig.rules.forEach((option, key) => {
  // console.log(key, JSON.stringify(option));
  namedRules.push({...(option as IOptions), ruleName: key});
});
const loadedRules = loadRules(namedRules, rulesFromConfig.rulesDirectory);
const report: any = {};

loadedRules.forEach((rule) => {
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
    deprecationMessage, options
  } = rulesAvailable.get(ruleName)!; // tslint:disable-line:no-non-null-assertion

  report[ruleName] = {
    ...(deprecationMessage && {deprecated: deprecationMessage}),
    ...(options && {options}),
    ...(ruleArguments && ruleArguments.length && {ruleArguments}),
    ruleSeverity
  };
});

fs.writeJSONSync('report,json', report, {spaces: 2});
console.log('active rules:', loadedRules.length);
