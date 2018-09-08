import * as fs from 'fs-extra';
import {uniqBy} from 'lodash';
import * as Path from 'path';

import {DOCS, TSLINT} from './constants';
import {Dict, PackageJson, RuleData, Source} from './types';

/**
 * [source, sourcePath]
 */
export type SourceTuple = [string, string];

export const createSourcesOrder = (rules: ReadonlyArray<RuleData>): ReadonlyArray<SourceTuple> => {
  const unordered = uniqBy(rules, r => r.source)
    .map<SourceTuple>(r => [r.source, r.sourcePath]);
  // TODO sort by order defined in config files? (issue #2)
  const tslint = unordered.find(([source]) => source === TSLINT);

  return tslint ? [
    tslint, // rules from tslint take precedence
    ...unordered.filter(it => it !== tslint)
  ] : unordered;
};

export const indexInSourceOrder = (
  sourcesOrder: ReadonlyArray<SourceTuple>
): (r: RuleData) => number => {
  const sources: ReadonlyArray<string> = sourcesOrder.map(([source]) => source);
  return r => sources.indexOf(r.source);
};

export const tupleToSources = (
  {readJsonSync}: Pick<typeof fs, 'readJsonSync'> = fs
) => (
  sources: Dict<Source>, [source, sourcePath]: SourceTuple
) => {
  const {
    _from, _resolved, bugs, deprecated, description, homepage, main, peerDependencies
  } = readJsonSync(Path.join(sourcePath, 'package.json')) as PackageJson;

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
};
