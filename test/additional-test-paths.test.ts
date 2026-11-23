import { expect, it } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { makeTestMatcher } from '../src/index/discover.js';

it('classifies idiomatic additional-language test paths', () => {
  const isTest = makeTestMatcher(defaultConfig());
  for (const file of ['store_test.go', 'src/test/java/App.java', 'AppTest.java', 'AppTests.cs', 'spec/store.rb', 'lib/store_spec.rb', 'test/unit/store_test.rb', 'tests/store.rs'])
    expect(isTest(file), file).toBe(true);
  for (const file of ['store.go', 'src/App.java', 'App.cs', 'lib/store.rb', 'src/store.rs']) expect(isTest(file), file).toBe(false);
});
