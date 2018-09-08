"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
const tslint_1 = require("tslint");
// tslint:disable-next-line:no-submodule-imports
const configuration_1 = require("tslint/lib/configuration");
const ExtendedMetadata_1 = require("./ExtendedMetadata");
exports.loadRulesFromConfig = (tslint_loadConfig = configuration_1.loadConfigurationFromPath, tslint_loadRules = tslint_1.loadRules) => (configFile) => {
    const rulesFromConfig = tslint_loadConfig(configFile, configFile);
    const namedRules = [];
    rulesFromConfig.rules.forEach((option, key) => {
        // console.log(key, JSON.stringify(option));
        namedRules.push(Object.assign({}, option, { ruleName: key }));
    });
    return lodash_1.sortBy(tslint_loadRules(namedRules, rulesFromConfig.rulesDirectory), 'ruleName');
};
/**
 sometimes deprecation message is an empty string, which still means deprecated,
 tslint-microsoft-contrib sets the group metadata to 'Deprecated' instead
 */
const deprecation = (deprecationMessage, group) => {
    if (deprecationMessage !== undefined) {
        return deprecationMessage || true;
    }
    return group === ExtendedMetadata_1.DEPRECATED;
};
exports.loadedToActiveRules = (rulesAvailable) => (report, rule) => {
    const { ruleName, ruleArguments, ruleSeverity } = rule.getOptions();
    const ruleData = rulesAvailable[ruleName];
    if (!ruleData) {
        console.log('Rule not found as available', ruleName);
        report[ruleName] = {
            ruleName,
            ruleArguments,
            ruleSeverity
        };
    }
    else {
        const { deprecationMessage, documentation, hasFix, group, source, sameName, type } = ruleData;
        const deprecated = deprecation(deprecationMessage, group);
        report[ruleName] = Object.assign({ ruleName,
            ruleSeverity,
            source }, (deprecated && { deprecated }), (documentation && { documentation }), (hasFix && { hasFix }), (group && { group }), (type && { type }), (ruleArguments && { ruleArguments }), (sameName && { sameName: sameName.map(r => r.id) }));
    }
    return report;
};
