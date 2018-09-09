"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const lodash_1 = require("lodash");
const Path = require("path");
const constants_1 = require("./constants");
exports.createSourcesOrder = (rules) => {
    const unordered = lodash_1.uniqBy(rules, r => r.source)
        .map(r => [r.source, r.sourcePath]);
    // TODO sort by order defined in config files? (issue #2)
    const tslint = unordered.find(([source]) => source === constants_1.TSLINT);
    return tslint ? [
        tslint,
        ...unordered.filter(it => it !== tslint)
    ] : unordered;
};
exports.indexInSourceOrder = (sourcesOrder) => {
    const sources = sourcesOrder.map(([source]) => source);
    return r => sources.indexOf(r.source);
};
exports.tupleToSources = ({ readJsonSync } = fs) => (sources, [source, sourcePath]) => {
    const { _from, _resolved, bugs, deprecated, description, homepage, main, peerDependencies } = readJsonSync(Path.join(sourcePath, 'package.json'));
    sources[sourcePath] = {
        _from,
        _resolved,
        bugs,
        deprecated,
        description,
        docs: source in constants_1.DOCS ? constants_1.DOCS[source] : 'unknown',
        homepage,
        main,
        name: source,
        path: sourcePath,
        peerDependencies
    };
    return sources;
};
