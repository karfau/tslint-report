"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const glob = require("glob");
const lodash_1 = require("lodash");
const Path = require("path");
const tslint_1 = require("tslint");
const configuration_1 = require("tslint/lib/configuration");
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
// const ruleSets = walk(process.cwd(), {nodir: true, filter: findRuleSets}).map(item => item.path);
const rules = glob.sync('*Rule.js', {
    nodir: true, matchBase: true, absolute: true, ignore: '**/tslint/lib/language/**'
});
const rulesAvailable = rules.reduce((map, path) => {
    let stripped;
    try {
        // tslint:disable-next-line:no-non-null-assertion
        stripped = /\/(\w+)Rule\..*/.exec(path)[1];
    }
    catch (error) {
        console.log(path, error);
        return map;
    }
    // tslint:disable-next-line:no-non-null-assertion
    const ruleName = lodash_1.kebabCase(stripped).replace(/-11-/, '11');
    const paths = path.split(Path.sep);
    const indexOf = paths.indexOf(NODE_MODULES);
    const source = indexOf > -1 ? paths[indexOf + 1] : path;
    // tslint:disable-next-line:non-literal-require
    const { Rule } = require(path);
    const data = Rule && Rule.metadata ? Rule.metadata : { ruleName: ruleName };
    return map.set(ruleName, Object.assign({}, data, { source }));
}, new Map());
console.log(`found ${rules.length} rules`);
const reportAvailable = {};
// tslint:disable-next-line
rulesAvailable.forEach((rule, key) => {
    delete rule.ruleName;
    reportAvailable[key] = rule;
});
fs.writeJSONSync('available-rules,json', reportAvailable, { spaces: 2 });
// const tslintJson = findConfiguration('tslint.json').results;
const configFile = Path.join(CWD, 'tslint.json');
const rulesFromConfig = configuration_1.loadConfigurationFromPath(configFile, configFile);
const namedRules = [];
rulesFromConfig.rules.forEach((option, key) => {
    // console.log(key, JSON.stringify(option));
    namedRules.push(Object.assign({}, option, { ruleName: key }));
});
const loadedRules = tslint_1.loadRules(namedRules, rulesFromConfig.rulesDirectory);
const report = {};
loadedRules.forEach((rule) => {
    const { ruleName, ruleArguments, ruleSeverity } = rule.getOptions();
    if (!rulesAvailable.has(ruleName)) {
        report[ruleName] = {
            ruleArguments,
            ruleSeverity
        };
        console.log('Rule not found as available', ruleName);
        return;
    }
    const { deprecationMessage, options } = rulesAvailable.get(ruleName); // tslint:disable-line:no-non-null-assertion
    report[ruleName] = Object.assign({}, (deprecationMessage && { deprecated: deprecationMessage }), (options && { options }), (ruleArguments && ruleArguments.length && { ruleArguments }), { ruleSeverity });
});
fs.writeJSONSync('report,json', report, { spaces: 2 });
console.log('active rules:', loadedRules.length);
