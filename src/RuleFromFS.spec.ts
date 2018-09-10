import {expect, use} from 'chai';

import {RuleFailure} from 'tslint';
import {AbstractRule} from 'tslint/lib/rules';
// import sinonChai = require('sinon-chai');
// use(sinonChai);
import {pathToRuleFromFS} from './RuleFromFS';
import sinon = require('sinon');

class Rule extends AbstractRule {
  apply(): RuleFailure[] {
    return [];
  }
}

class RuleMeta extends Rule {
  public static metadata = {} as any;
}

const TO_PROJECT = '/home/me/dev/project';

describe('pathToRuleFromFS', () => {
  let requireStub: sinon.SinonStub;
  let curried: Function;
  beforeEach(() => {
    requireStub = sinon.mock();
    curried = pathToRuleFromFS(TO_PROJECT, requireStub as any);
  });

  it('should return undefined if require is not returning a Rule', () => {
    expect(curried(``)).to.be.undefined;
  });

  it('should return undefined if path does not match pattern', () => {
    requireStub.returns({Rule});
    expect(curried(`/Rule.js`)).to.be.undefined;
  });

  it('should provide correct data without metadata', () => {
    requireStub.returns({Rule});
    const path = `/node_modules/tslint/lib/rules/SomeNamedRule.js`;

    const sourcePath = './node_modules/tslint';
    const ruleName = 'some-named';

    expect(
      curried(`${TO_PROJECT}${path}`)
    ).to.contain({
      id: `${sourcePath}:${ruleName}`,
      path: `.${path}`,
      ruleName,
      source: 'tslint',
      sourcePath
    });
  });

  it('should provide correct data with metadata', () => {
    requireStub.returns({Rule: RuleMeta});

    expect(curried('src/wellDocumentedRulesRule.js').metadata)
      .to.equal(RuleMeta.metadata);
  });

  it('should provide project name as source', () => {
    requireStub.returns({Rule});

    expect(curried('src/wellDocumentedRulesRule.js').source)
      .to.equal('project');
  });

  it('should correctly convert numbers in ruleName', () => {
    requireStub.returns({Rule});
    const path = `/node_modules/tslint/lib/rules/i18nUsageRule.js`;

    expect(
      curried(`${TO_PROJECT}${path}`)
    ).to.contain({ruleName: 'i18n-usage'});
  });
});
