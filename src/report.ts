import * as fs from 'fs-extra';
import * as glob from 'glob';

import {kebabCase, sortBy, countBy, uniqBy, values} from 'lodash';
import * as Path from 'path';
import {IOptions, loadRules, Rules} from 'tslint';
// tslint:disable-next-line:no-submodule-imports
import {loadConfigurationFromPath} from 'tslint/lib/configuration';
import {DEPRECATED} from './ExtendedMetadata';
import {
  ActiveRule,
  Dict,
  PackageJson,
  ReportData,
  RuleData,
  RuleMetadata,
  RuleName,
  Source
} from './types';

const RULE_PATTERN = '{RULE}';

// tslint:disable-next-line:no-var-requires
const DOCS: Dict<string> = require('../rules.docs.json');

const NODE_MODULES = 'node_modules';
const TSLINT = `tslint`;
const CWD = process.cwd();

// const ruleSets = walk(process.cwd(), {nodir: true, filter: findRuleSets}).map(item => item.path);
const ruleId = (
  {ruleName, sourcePath}: { ruleName: string; sourcePath: string }
) => `${sourcePath}:${ruleName}`;

type Raw = ReportData & RuleName & {
  metadata?: any;
};

const rules: ReadonlyArray<RuleData> = glob
// everything ending with Rule.js could be a tslint rule
  .sync('*Rule.js', {
    nodir: true, matchBase: true, absolute: true, ignore: [
      // there are some problematic exceptions
      '**/tslint/lib/language/**', '**/Rule.js'
    ]
  })
  .map((path): Raw | undefined => {
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

    const relativePath = path.replace(CWD, `.`);
    const paths = relativePath.split(Path.sep);
    const indexOfSource = paths.lastIndexOf(NODE_MODULES) + 1;
    const isInNodeModules = indexOfSource > 0;
    const sourcePath = isInNodeModules ?
      paths.slice(0, indexOfSource + 1).join(Path.sep) : '.';
    const source = Path.basename(isInNodeModules ? sourcePath : CWD);

    // tslint:disable-next-line:non-literal-require
    const {Rule} = require(path);
    if (!(Rule && Rule instanceof Rules.AbstractRule.constructor)) return;

    return {
      id: ruleId({ruleName, sourcePath}),
      ruleName,
      path: relativePath,
      metadata: Rule.metadata,
      source,
      sourcePath
    };
  })
  .filter((r): r is Raw => r !== undefined)
  .map(({metadata, ruleName, source, sourcePath, ...data}) => {
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
  });

const createSourcesOrder = (rules: ReadonlyArray<RuleData>): ReadonlyArray<[string, string]> => {
  const unordered = uniqBy(rules, r => r.source)
    .map<[string, string]>(r => [r.source, r.sourcePath]);
  // TODO sort by order defined in config files? (issue #2)
  const tslint = unordered.find(([source]) => source === TSLINT);

  return tslint ? [
    tslint, // rules from tslint take precedence
    ...unordered.filter(it => it !== tslint)
  ] : unordered;
};

const sourcesOrder = createSourcesOrder(rules);

const sources = sourcesOrder
  .reduce<Dict<Source>>(
    (sources, [source, sourcePath]) => {
      const {
        _from, _resolved, bugs, deprecated, description, homepage, main, peerDependencies
      } = fs.readJsonSync(Path.join(sourcePath, 'package.json')) as PackageJson;

      sources[sourcePath] = {
        _from,
        _resolved,
        bugs,
        deprecated,
        description,
        docs: source in DOCS ? DOCS[source as keyof typeof DOCS] : 'unknown',
        homepage,
        main,
        name: source,
        path: sourcePath,
        peerDependencies
      };
      return sources;
    },
    {}
  );

const rulesAvailable = sortBy(
  rules, ['ruleName', (r: RuleData) => sourcesOrder.findIndex(([source]) => r.source === source)])
  .reduce<Dict<RuleData>>(
    (dict, rule) => {
      const {ruleName} = rule;

      const existing = dict[ruleName];
      if (existing) {
        if (existing.source !== TSLINT && !existing.sameName) {
          console.log(
            `rule name '${ruleName}' available from different sources (first extend wins)`
          );
        }
        existing.sameName = [...(existing.sameName ? existing.sameName : []), rule];
      } else {
        dict[ruleName] = rule;
      }
      return dict;
    },
    {}
  );

console.log(
  `${rules.length} rules available from ${Object.keys(sources).length} sources:`,
  JSON.stringify(Object.keys(sources), undefined, 2)
);
fs.writeJSONSync('tslint.report.sources.json', sources, {spaces: 2});
fs.writeJSONSync('tslint.report.available.json', rulesAvailable, {spaces: 2});

const configFile = Path.join(CWD, 'tslint.json');

const rulesFromConfig = loadConfigurationFromPath(configFile, configFile);
const namedRules: IOptions[] = [];
rulesFromConfig.rules.forEach((option, key) => {
  // console.log(key, JSON.stringify(option));
  namedRules.push({...(option as IOptions), ruleName: key});
});
const loadedRules = sortBy(loadRules(namedRules, rulesFromConfig.rulesDirectory), 'ruleName');

// sometimes deprecation message is an empty string, which still means deprecated,
// tslint-microsoft-contrib sets the group metadata to 'Deprecated' instead
const deprecation = (
  deprecationMessage: string | undefined, group: string | undefined
): string | boolean => {
  if (deprecationMessage !== undefined) {
    return deprecationMessage || true;
  }
  return group === DEPRECATED;
};

const report = loadedRules.reduce<Dict<ActiveRule>>(
  (report, rule) => {
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
        ruleName,
        ruleSeverity,
        source,
        ...(deprecated && {deprecated}),
        ...(documentation && {documentation}),
        ...(hasFix && {hasFix}),
        ...(group && {group}),
        ...(type && {type}),
        ...(ruleArguments && {ruleArguments}),
        ...(sameName && {sameName: sameName.map(r => r.id)})
      };
    }
    return report;
  },
  {}
);

values(report)
  .filter(r => r.deprecated)
  .forEach(({ruleName, source}) => {
    console.warn(`WARNING: The deprecated rule '${ruleName}' from '${source}' is active.`);
  });

fs.writeJSONSync('tslint.report.active.json', report, {spaces: 2});
console.log('active rules:', loadedRules.length);

const reportBy = (key: keyof ActiveRule) => console.log(
  `by ${key}:\n${JSON.stringify(countBy(report, key), null, 2).replace(/[{}]/g, '')}`
);
reportBy('type');
reportBy('group');
