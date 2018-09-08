import {kebabCase} from 'lodash';
import * as Path from 'path';
// tslint:disable-next-line:no-submodule-imports
import {AbstractRule} from 'tslint/lib/rules';

import {DOCS, NODE_MODULES, RULE_PATTERN} from './constants';
import {ReportData, RuleMetadata, RuleName} from './types';

type RuleFromFS = ReportData & RuleName & {
  metadata?: any;
};
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
  if (!(Rule && Rule instanceof AbstractRule.constructor)) return;

  return {
    ruleName,
    source,
    path: relativePath,
    metadata: Rule.metadata,
    sourcePath,
    id: `${sourcePath}:${ruleName}`
  };
};

export const fsToRuleData = ({metadata, ruleName, source, sourcePath, ...data}: RuleFromFS) => {
  if (!metadata) {
    console.log('no metadata found in rule', sourcePath, ruleName);
  }
  const documentation = (source in DOCS ? DOCS[source as keyof typeof DOCS] : '')
    .replace(new RegExp(RULE_PATTERN, 'g'), ruleName);

  const meta: RuleMetadata = metadata ? metadata : {ruleName: ruleName};
  if (!meta.options) {
    delete meta.options;
    delete meta.optionsDescription;
    delete meta.optionExamples;
  }
  if (meta.ruleName !== ruleName) {
    console.log(
      'mismatching ruleName from file and metadata.ruleName:',
      {ruleName, ['metadata.ruleName']: meta.ruleName}
    );
    // we expect this mismatch to be not by intention, so get rid of it
    delete meta.ruleName;
  }

  return {
    ruleName,
    source,
    ...data,
    ...meta,
    ...(documentation && {documentation}),
    sourcePath
  };
};
