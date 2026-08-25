import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const targetSkills = [
  'figma-scene',
  'figma-typography',
  'figma-visual-system',
  'figma-motion',
  'figma-prototype',
  'figma-design-system',
  'figma-verification',
  'figma-code-connect',
  'figma-code-to-design',
  'figma-design-to-design',
  'figma-design-to-code',
];

function markdownFiles(skillName) {
  const base = path.join(ROOT, 'skills', skillName);
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.name.endsWith('.md')) files.push(absolute);
    }
  };
  walk(base);
  return files;
}

test('remaining Skills do not prescribe named sibling activation or handoff', () => {
  const routePatterns = [
    /\bcompose(?:\s+with)?\s+`figma-[a-z-]+`/gi,
    /\bactivate\s+`figma-[a-z-]+`/gi,
    /\buse\s+`figma-[a-z-]+`\s+first/gi,
    /\bhand(?:\s+[a-z-]+){0,6}\s+to\s+`figma-[a-z-]+`/gi,
    /\bmove(?:\s+[a-z-]+){0,6}\s+to\s+`figma-[a-z-]+`/gi,
    /\broute(?:\s+[a-z-]+){0,6}\s+to\s+`figma-[a-z-]+`/gi,
  ];
  const violations = [];
  for (const skill of targetSkills) {
    for (const file of markdownFiles(skill)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const pattern of routePatterns) {
        for (const match of text.matchAll(pattern)) violations.push(`${path.relative(ROOT, file)}: ${match[0]}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('remaining Skill control surfaces express semantic boundaries instead of sibling Skill tables', () => {
  const violations = [];
  for (const skill of targetSkills) {
    const relative = `skills/${skill}/SKILL.md`;
    const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    for (const match of text.matchAll(/`figma-[a-z-]+`/g)) violations.push(`${relative}: ${match[0]}`);
  }
  assert.deepEqual(violations, []);
});

test('remaining domain Skill control surfaces do not embed ControlMux local MCP wire names', () => {
  const wire = /\bfigma_(?:status|query|apply|exec|export)\b/g;
  const violations = [];
  for (const skill of targetSkills) {
    const relative = `skills/${skill}/SKILL.md`;
    const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    for (const match of text.matchAll(wire)) violations.push(`${relative}: ${match[0]}`);
  }
  assert.deepEqual(violations, []);
});

test('maintainer lexicon remains optional maintenance truth for the remaining Skills', () => {
  for (const skill of targetSkills) {
    for (const file of markdownFiles(skill)) {
      const text = fs.readFileSync(file, 'utf8');
      assert.equal(text.includes('SKILL-LEXICON.md'), false, `${path.relative(ROOT, file)} must not depend on maintainer lexicon`);
    }
  }
});
