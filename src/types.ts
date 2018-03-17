import {IRuleMetadata, RuleSeverity} from 'tslint';
import {ExtendedMetadata} from './ExtendedMetadata';

export type RuleName = {
  ruleName: string;
};

export type ReportData = {
  documentation?: string;
  path: string;
  source: string;
  sourcePath: string;
  sameName?: string[];
};

export type RuleMetadata = Partial<IRuleMetadata & ExtendedMetadata> & RuleName;

export type RuleData = RuleMetadata & ReportData;

export type PackageJson = {
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

export type Source = PackageJson & {
  name: string;
  path: string;
  docs: string;
};

export type Dict<T> = {[key: string]: T};

export type ActiveRule = {
  deprecated?: string | boolean;
  documentation?: string;
  ruleArguments?: any[];
  ruleSeverity: RuleSeverity;
  sameName?: string[];
  source?: string;
};
