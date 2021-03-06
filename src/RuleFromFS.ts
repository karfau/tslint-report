import {kebabCase} from 'lodash';
import * as Path from 'path';
// tslint:disable-next-line:no-submodule-imports
import {AbstractRule} from 'tslint/lib/rules';

import {DOCS, NODE_MODULES, RULE_PATTERN} from './constants';
import {ReportData, RuleMetadata, RuleName} from './types';

type RuleFromFS = ReportData & RuleName & {
  metadata?: any;
};

const extendsAbstractRule = (Rule: unknown): Rule is typeof AbstractRule =>
  Rule && Rule instanceof AbstractRule.constructor;

export const isRuleFromFS = (r: RuleFromFS | undefined): r is RuleFromFS => r !== undefined;

export const pathToRuleFromFS = (
  baseDir: string, req = require
) => (
  path: string
): RuleFromFS | undefined => {
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

  const relativePath = path.replace(baseDir, `.`);
  const paths = relativePath.split(Path.sep);
  const indexOfSource = paths.lastIndexOf(NODE_MODULES) + 1;
  const isInNodeModules = indexOfSource > 0;
  const sourcePath = isInNodeModules ?
    paths.slice(0, indexOfSource + 1).join(Path.sep) : '.';
  const source = Path.basename(isInNodeModules ? sourcePath : baseDir);

  // tslint:disable-next-line:non-literal-require
  const {Rule} = req(path);
  if (!extendsAbstractRule(Rule)) return;

  return {
    id: `${sourcePath}:${ruleName}`,
    metadata: Rule.metadata,
    path: relativePath,
    ruleName,
    source,
    sourcePath
  };
};

export const fsToRuleData = (
  {id, metadata, path, ruleName, source, sourcePath}: RuleFromFS
) => {
  if (!metadata) {
    console.log('no metadata found in rule', sourcePath, ruleName);
  }
  const documentation = (source in DOCS ? DOCS[source as keyof typeof DOCS] : '')
    .replace(new RegExp(RULE_PATTERN, 'g'), ruleName);

  const {ruleName: metaRuleName, ...meta}: RuleMetadata = metadata ? metadata : {};
  if (!meta.options) {
    delete meta.options;
    delete meta.optionsDescription;
    delete meta.optionExamples;
  }
  if (metaRuleName && metaRuleName !== ruleName) {
    console.log(
      'mismatching ruleName from file and metadata.ruleName:',
      {ruleName, ['metadata.ruleName']: metaRuleName}
    );
  }

  return {
    id,
    ...meta,
    ...(documentation && {documentation}),
    path,
    ruleName,
    source,
    sourcePath
  };
};
