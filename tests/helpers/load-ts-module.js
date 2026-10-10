import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

export function createTsLoader(overrides = {}) {
  const cache = new Map();
  return function load(filename, append = '') {
    filename = resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const nativeRequire = createRequire(filename);
    const require = (specifier) => {
      if (Object.prototype.hasOwnProperty.call(overrides, specifier)) return overrides[specifier];
      if (specifier.startsWith('.')) {
        const base = resolve(dirname(filename), specifier);
        const target = [base, `${base}.tsx`, `${base}.ts`, `${base}.js`].find((candidate) => existsSync(candidate));
        if (target?.endsWith('.tsx') || target?.endsWith('.ts')) return load(target);
      }
      return nativeRequire(specifier);
    };
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8') + append, {
      fileName: filename,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(compiled, { exports: module.exports, require, console, URL, AbortController }, { filename });
    return module.exports;
  };
}
