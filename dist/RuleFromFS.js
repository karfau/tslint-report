"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
const Path = require("path");
// tslint:disable-next-line:no-submodule-imports
const rules_1 = require("tslint/lib/rules");
const constants_1 = require("./constants");
exports.isRuleFromFS = (r) => r !== undefined;
exports.pathToRuleFromFS = (baseDir, req = require) => (path) => {
    let stripped;
    try {
        // tslint:disable-next-line:no-non-null-assertion
        stripped = /\/(\w+)Rule\..*/.exec(path)[1];
    }
    catch (error) {
        console.log(path, error);
        return;
    }
    // kebabCase from ladash is not compatible with tslint's name conversion
    // so we need to remove the '-' sign before and after the 11
    // that are added by kebabCase for all the
    // react-a11y-* rules from tslint-microsoft-contrib
    const ruleName = lodash_1.kebabCase(stripped).replace(/-11-/, '11');
    const relativePath = path.replace(baseDir, `.`);
    const paths = relativePath.split(Path.sep);
    const indexOfSource = paths.lastIndexOf(constants_1.NODE_MODULES) + 1;
    const isInNodeModules = indexOfSource > 0;
    const sourcePath = isInNodeModules ?
        paths.slice(0, indexOfSource + 1).join(Path.sep) : '.';
    const source = Path.basename(isInNodeModules ? sourcePath : baseDir);
    // tslint:disable-next-line:non-literal-require
    const { Rule } = req(path);
    if (!(Rule && Rule instanceof rules_1.AbstractRule.constructor))
        return;
    return {
        id: `${sourcePath}:${ruleName}`,
        metadata: Rule.metadata,
        path: relativePath,
        ruleName,
        source,
        sourcePath
    };
};
exports.fsToRuleData = ({ id, metadata, path, ruleName, source, sourcePath }) => {
    if (!metadata) {
        console.log('no metadata found in rule', sourcePath, ruleName);
    }
    const documentation = (source in constants_1.DOCS ? constants_1.DOCS[source] : '')
        .replace(new RegExp(constants_1.RULE_PATTERN, 'g'), ruleName);
    const meta = metadata ? metadata : { ruleName: ruleName };
    if (!meta.options) {
        delete meta.options;
        delete meta.optionsDescription;
        delete meta.optionExamples;
    }
    if (meta.ruleName !== ruleName) {
        console.log('mismatching ruleName from file and metadata.ruleName:', { ruleName, ['metadata.ruleName']: meta.ruleName });
        // we expect this mismatch to be not by intention, so get rid of it
        delete meta.ruleName;
    }
    return Object.assign({ id }, meta, (documentation && { documentation }), { path,
        ruleName,
        source,
        sourcePath });
};
