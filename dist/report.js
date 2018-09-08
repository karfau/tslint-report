"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const glob = require("glob");
const lodash_1 = require("lodash");
const Path = require("path");
const constants_1 = require("./constants");
const RuleFromFS_1 = require("./RuleFromFS");
const RuleFromTslint_1 = require("./RuleFromTslint");
const sources_1 = require("./sources");
const CWD = process.cwd();
const rules = glob
    // everything ending with Rule.js could be a tslint rule
    .sync('*Rule.js', {
    cwd: CWD, nodir: true, matchBase: true, absolute: true, ignore: [
        // there are some problematic exceptions
        '**/tslint/lib/language/**', '**/Rule.js'
    ]
})
    .map(RuleFromFS_1.pathToRuleFromFS(CWD))
    .filter(RuleFromFS_1.isRuleFromFS)
    .map(RuleFromFS_1.fsToRuleData);
const sourcesOrder = sources_1.createSourcesOrder(rules);
const sources = sourcesOrder.reduce(sources_1.tupleToSources(), {});
const rulesAvailable = lodash_1.sortBy(rules, ['ruleName', sources_1.indexInSourceOrder(sourcesOrder)]).reduce((dict, rule) => {
    const { ruleName } = rule;
    const existing = dict[ruleName];
    if (existing) {
        if (existing.source !== constants_1.TSLINT && !existing.sameName) {
            console.log(`rule name '${ruleName}' available from different sources (first extend wins)`);
        }
        existing.sameName = [...(existing.sameName ? existing.sameName : []), rule];
    }
    else {
        dict[ruleName] = rule;
    }
    return dict;
}, {});
console.log(`${rules.length} rules available from ${Object.keys(sources).length} sources:`, JSON.stringify(Object.keys(sources), undefined, 2));
fs.writeJSONSync('tslint.report.sources.json', sources, { spaces: 2 });
fs.writeJSONSync('tslint.report.available.json', rulesAvailable, { spaces: 2 });
const loadedRules = RuleFromTslint_1.loadRulesFromConfig()(Path.join(CWD, 'tslint.json'));
const report = loadedRules.reduce(RuleFromTslint_1.loadedToActiveRules(rulesAvailable), {});
lodash_1.values(report)
    .filter(r => r.deprecated)
    .forEach(({ ruleName, source }) => {
    console.warn(`WARNING: The deprecated rule '${ruleName}' from '${source}' is active.`);
});
fs.writeJSONSync('tslint.report.active.json', report, { spaces: 2 });
console.log('active rules:', loadedRules.length);
const reportBy = (key) => console.log(`by ${key}:\n${JSON.stringify(lodash_1.countBy(report, key), null, 2).replace(/[{}]/g, '')}`);
reportBy('type');
reportBy('group');
