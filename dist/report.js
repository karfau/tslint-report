"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) if (e.indexOf(p[i]) < 0)
            t[p[i]] = s[p[i]];
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const glob = require("glob");
const lodash_1 = require("lodash");
const Path = require("path");
const ExtendedMetadata_1 = require("./ExtendedMetadata");
const tslint_1 = require("tslint");
// tslint:disable-next-line:no-submodule-imports
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
const ruleId = ({ ruleName, sourcePath }) => `${sourcePath}:${ruleName}`;
const rules = glob.sync('*Rule.js', {
    nodir: true, matchBase: true, absolute: true, ignore: [
        '**/tslint/lib/language/**', '**/Rule.js', '**/stylelint/**'
    ]
});
const rulesAvailable = rules.reduce(
// tslint:disable-next-line:cyclomatic-complexity
(map, path) => {
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
    const paths = path.replace(CWD, `.`).split(Path.sep);
    const indexOfSource = paths.lastIndexOf(NODE_MODULES) + 1;
    const sourcePath = indexOfSource > 0 ?
        paths.slice(0, indexOfSource + 1).join(Path.sep) : Path.basename(CWD);
    const source = Path.basename(sourcePath);
    // tslint:disable-next-line:non-literal-require
    const { Rule } = require(path);
    if (!(Rule && Rule instanceof tslint_1.Rules.AbstractRule.constructor))
        return map;
    if (!Rule.metadata) {
        console.warn('no metadata found in rule', sourcePath, ruleName);
    }
    const data = Object.assign({}, (Rule.metadata ? Rule.metadata : { ruleName: ruleName }), { source, sourcePath });
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
        }
        else {
            // non deterministic which one wins
            if (existing.source !== 'tslint') {
                console.warn(`rules with same name '${ruleName}' from different sources`, [existingId, currentId]);
            }
            // we keep the one in the map, point to the conflict and only store the current one under ID
            existing.sameName = [...(existing.sameName ? existing.sameName : []), currentId];
            map.set(currentId, data);
        }
    }
    else {
        map.set(ruleName, data);
    }
    return map;
}, new Map());
console.log(``);
const reportAvailable = {};
const sourcePaths = new Set();
// tslint:disable-next-line
lodash_1.sortBy(Array.from(rulesAvailable.keys())).forEach((key) => {
    // tslint:disable-next-line:no-non-null-assertion since we are iterating keys
    const rule = Object.assign({}, rulesAvailable.get(key));
    const { ruleName, sourcePath } = rule, ruleData = __rest(rule, ["ruleName", "sourcePath"]);
    sourcePaths.add(rule.sourcePath);
    reportAvailable[key] = ruleData;
});
console.log(`${rules.length} rules available from ${sourcePaths.size} sources:\n`, Array.from(sourcePaths.values()).join(', '));
fs.writeJSONSync('tslint.report.available.json', reportAvailable, { spaces: 2 });
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
// tslint:disable-next-line:cyclomatic-complexity
lodash_1.sortBy(loadedRules, 'ruleName').forEach((rule) => {
    const { ruleName, ruleArguments, ruleSeverity } = rule.getOptions();
    if (!rulesAvailable.has(ruleName)) {
        report[ruleName] = {
            ruleArguments,
            ruleSeverity
        };
        console.log('Rule not found as available', ruleName);
        return;
    }
    const ruleData = rulesAvailable.get(ruleName); // tslint:disable-line:no-non-null-assertion
    const { deprecationMessage, group, source, sameName } = ruleData;
    // sometimes deprecation message is an empty string, which still means deprecated,
    // tslint-microsoft-contrib sets the group metadata to 'Deprecated' instead
    const deprecated = deprecationMessage !== undefined || (group && group === ExtendedMetadata_1.DEPRECATED);
    if (deprecated)
        console.warn(`WARNING: The deprecated rule '${ruleName}' from '${source}' is active.`);
    report[ruleName] = Object.assign({}, (deprecated && { deprecated: deprecationMessage || true }), (ruleArguments && ruleArguments.length && { ruleArguments }), { ruleSeverity,
        source }, (source !== 'tslint' && sameName && sameName.length && { sameName }));
});
fs.writeJSONSync('tslint.report.active.json', report, { spaces: 2 });
console.log('active rules:', loadedRules.length);
