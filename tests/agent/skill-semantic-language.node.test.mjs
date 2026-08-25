import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const targetSkills = [
  'figma-design-authoring',
  'figma-layout',
  'figma-components',
  'figma-tokens',
];

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function skillFiles(skillName) {
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

test('shared lexicon is maintainer truth, not a Skill runtime dependency', () => {
  const lexicon = path.join(ROOT, 'docs', 'SKILL-LEXICON.md');
  assert.equal(fs.existsSync(lexicon), true, 'docs/SKILL-LEXICON.md must exist');

  for (const skill of targetSkills) {
    for (const file of skillFiles(skill)) {
      const text = fs.readFileSync(file, 'utf8');
      assert.equal(
        text.includes('SKILL-LEXICON.md'),
        false,
        `${path.relative(ROOT, file)} must remain standalone instead of loading the maintainer lexicon`,
      );
    }
  }
});

test('target Skill prose does not route named sibling Skills', () => {
  const routePatterns = [
    /\bcompose\s+`?figma-[a-z-]+`?/gi,
    /\bactivate\s+`?figma-[a-z-]+`?/gi,
    /\bhand(?:\s+[a-z-]+){0,4}\s+to\s+`?figma-[a-z-]+`?/gi,
  ];

  const violations = [];
  for (const skill of targetSkills) {
    for (const file of skillFiles(skill)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const pattern of routePatterns) {
        for (const match of text.matchAll(pattern)) {
          violations.push(`${path.relative(ROOT, file)}: ${match[0]}`);
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('domain Skill control surfaces do not embed the ControlMux wire DSL', () => {
  const wirePatterns = [
    /\bfigma_(?:status|query|apply|exec|export)\b/g,
    /\blayout_command:/g,
    /\bcomponent_command:/g,
    /\bopRef\b/g,
    /\bset_bindings\b/g,
    /collection:\{opRef\}/g,
    /\bmembers\[\]/g,
    /\bresultMode\b/g,
    /\bcontrolId\b/g,
    /\bbinding_inventory\b/g,
    /\bvariable_details\b/g,
  ];

  const violations = [];
  for (const skill of targetSkills) {
    const relative = `skills/${skill}/SKILL.md`;
    const text = read(relative);
    for (const pattern of wirePatterns) {
      for (const match of text.matchAll(pattern)) {
        violations.push(`${relative}: ${match[0]}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});
