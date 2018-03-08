# tslint-report

This is a utility for maintaining a [tslint](https://github.com/palantir/tslint) rule set.

The goal is to allow generating reports that can easily be compared,
 e.g. when upgrading versions or modifying the rule set. 

## Usage

`npx github:karfau/tslint-report`

- expects to find a `tslint.json` in your working directory 
- generates two report in the same folder: `available-rules,json` and `report,json`
