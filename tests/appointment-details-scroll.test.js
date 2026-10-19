import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';
import ts from 'typescript';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

test('appointment details use a dedicated scroll area rather than clipping long content', () => {
  let dialog;
  function visit(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === 'section'
      && node.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute)
        && attribute.name.getText(ast) === 'aria-labelledby'
        && attribute.initializer?.text === 'appointment-receipt-title')) {
      dialog = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(dialog, 'The actual appointment details dialog must be checked');
  const className = dialog.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute)
    && attribute.name.getText(ast) === 'className').initializer.text;
  assert.ok(className.split(/\s+/).includes('appointment-details-dialog'));
  assert.doesNotMatch(className, /\boverflow-hidden\b/);
});

test('portalled appointment details have viewport bounds and native scrolling in every layout', () => {
  const css = postcss.parse(readFileSync(new URL('../src/index.css', import.meta.url), 'utf8'));
  const declarations = new Map();
  css.walkRules('.appointment-details-dialog', (rule) => {
    assert.equal(rule.parent.type, 'root', 'The rule must also apply to dialogs portalled outside the dashboard');
    rule.walkDecls((declaration) => {
      const values = declarations.get(declaration.prop) || [];
      declarations.set(declaration.prop, [...values, declaration.value]);
    });
  });
  assert.deepEqual(declarations.get('max-height'), ['calc(100vh - 2rem)', 'calc(100dvh - 2rem)']);
  assert.deepEqual(declarations.get('overflow-y'), ['auto']);
  assert.deepEqual(declarations.get('overscroll-behavior'), ['contain']);
  assert.deepEqual(declarations.get('flex-shrink'), ['0']);
});
