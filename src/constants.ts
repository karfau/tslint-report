import {Dict} from './types';

export const RULE_PATTERN = '{RULE}';
export const NODE_MODULES = 'node_modules';
export const TSLINT = `tslint`;

// tslint:disable-next-line:no-var-requires
export const DOCS: Readonly<Dict<string>> = require('../rules.docs.json');

