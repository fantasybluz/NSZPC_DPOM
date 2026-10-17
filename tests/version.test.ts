// 發版時 VERSION 跟 CHANGELOG.md 要一起改（見 RELEASING.md）；這個測試不用開伺服器
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const version = readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim();
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const headings = [...changelog.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());

describe('版號', () => {
  it('VERSION 是 x.y.z', () => {
    assert.match(version, /^\d+\.\d+\.\d+$/);
  });

  it('CHANGELOG.md 最上面是「未發佈」，下一段就是 VERSION 這一版', () => {
    assert.equal(headings[0], '未發佈');
    assert.equal(headings[1], version);
  });

  it('package.json 的 version 跟 VERSION 一樣', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(pkg.version, version);
  });
});
