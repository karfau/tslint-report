import {sortBy, omitBy, isEmpty} from 'lodash';
import {IOptions, IRule, loadRules, RuleSeverity} from 'tslint';
// tslint:disable-next-line:no-submodule-imports
import {loadConfigurationFromPath} from 'tslint/lib/configuration';

import {DEPRECATED} from './ExtendedMetadata';
import {Dict, RuleData, RuleName} from './types';

export type ActiveRule = RuleName & {
  deprecated?: string | boolean;
  documentation?: string;
  hasFix?: boolean;
  ruleArguments?: any[];
  ruleSeverity: RuleSeverity;
  sameName?: string[];
  source?: string;
  group?: string;
  type?: string;
};

export const loadRulesFromConfig = (
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

export const loadedToActiveRules = (
  rulesAvailable: Dict<RuleData>
) => (
  report: Dict<ActiveRule>, rule: IRule
) => {
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
      ...(deprecated && {deprecated}),
      ...(documentation && {documentation}),
      ...(hasFix && {hasFix}),
      ruleSeverity,
      ...omitBy(
        {
          group,
          type,
          ruleArguments,
          sameName: sameName ? sameName.map(r => r.id) : []
        },
        isEmpty
      ),
      ruleName,
      source
    };
  }
  return report;
};
