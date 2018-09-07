# tslint-report

This is a utility for maintaining a [tslint](https://github.com/palantir/tslint) rule set.

The goal is to generate reports that can easily be compared,
 e.g. when upgrading versions or modifying the rule set. 

It would be nice to integrate this into `tslint` at some poit in time, but having a small tool that does exactly one thing and does it well also has it's benefit.

## Dependencies

For this tool to work the project you execute it in needs to have a version of `tslint` and `typescript` installed, since these are peer dependencies.

You can use `npx -p tslint -p typescript github:karfau/tslint-report#<hash-or-tag>` for a temporary addition of those dependencies (see [Usage](#usage))

## Usage

- expects to find a `tslint.json` in your working directory 
- generates three reports: 
  - `tslint.report.available.json`
  - `tslint.report.active.json`
  - `tslint.report.sources.json`

### One time script

`npx github:karfau/tslint-report#<hash-or-tag>`

You can of course add this to your npm scripts for ease of use

### as devDependency

1. `npn install -D github:karfau/tslint-report#<hash-or-tag>`
2. `npx tslint-report`

### from local clone

1. Change the working directory to where the `tslint.json` is.
2. You can use the prebuilt version:   
   `node ./rel/path/to/tslint-report/bin/tslint-report`
   or run the source using `ts-node`:  
   `[./node_modules/.bin/]ts-node ./rel/path/to/tslint-report/src/report.ts`
   
