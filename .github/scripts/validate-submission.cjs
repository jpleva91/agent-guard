#!/usr/bin/env node
// Validates a BugMon submission from a GitHub issue body.
// Usage: node validate-submission.js <issue-body>
// Outputs JSON: { valid: boolean, errors: string[], bugmon: object | null }

const fs = require('fs');
const path = require('path');

const STAT_MIN = 1;
const STAT_MAX = 120;
const VALID_RARITIES = ['common', 'uncommon', 'legendary'];

function parseIssueBody(body) {
  // GitHub issue forms produce markdown with ### headers and values below them.
  const fields = {};
  const lines = body.split('\n');
  let currentField = null;
  let currentValue = [];

  for (const line of lines) {
    const headerMatch = line.match(/^### (.+)$/);
    if (headerMatch) {
      if (currentField) {
        fields[currentField] = currentValue.join('\n').trim();
      }
      currentField = headerMatch[1].trim();
      currentValue = [];
    } else if (currentField) {
      currentValue.push(line);
    }
  }
  if (currentField) {
    fields[currentField] = currentValue.join('\n').trim();
  }

  return fields;
}

function moveNameToId(name) {
  return name.toLowerCase().replace(/\s+/g, '');
}

function validate(issueBody) {
  const errors = [];
  const fields = parseIssueBody(issueBody);

  // Load game data
  const dataDir = path.join(__dirname, '..', '..', 'data');
  const monsters = JSON.parse(fs.readFileSync(path.join(dataDir, 'monsters.json'), 'utf8'));
  const moves = JSON.parse(fs.readFileSync(path.join(dataDir, 'moves.json'), 'utf8'));
  const typesData = JSON.parse(fs.readFileSync(path.join(dataDir, 'types.json'), 'utf8'));

  const validTypes = typesData.types;
  const validMoveIds = moves.map(m => m.id);
  const validMoveNames = moves.map(m => m.name);
  const existingNames = monsters.map(m => m.name.toLowerCase());

  // Validate name
  const name = (fields['Name'] || '').trim();
  if (!name) {
    errors.push('Name is required.');
  } else if (!/^[a-zA-Z0-9]+$/.test(name)) {
    errors.push('Name must contain only letters and numbers (no spaces or special characters).');
  } else if (existingNames.includes(name.toLowerCase())) {
    errors.push(`A BugMon named "${name}" already exists.`);
  }

  // Validate type
  const type = (fields['Type'] || '').trim().toLowerCase();
  if (!type) {
    errors.push('Type is required.');
  } else if (!validTypes.includes(type)) {
    errors.push(`Invalid type "${type}". Must be one of: ${validTypes.join(', ')}.`);
  }

  // Validate stats
  const stats = {};
  for (const statName of ['HP', 'Attack', 'Defense', 'Speed']) {
    const raw = (fields[statName] || '').trim();
    const val = parseInt(raw, 10);
    if (!raw || isNaN(val)) {
      errors.push(`${statName} must be a number.`);
    } else if (val < STAT_MIN || val > STAT_MAX) {
      errors.push(`${statName} must be between ${STAT_MIN} and ${STAT_MAX} (got ${val}).`);
    } else {
      stats[statName.toLowerCase()] = val;
    }
  }

  // Validate moves (3 moves required, all different)
  const moveNames = [];
  const moveIds = [];
  for (let i = 1; i <= 3; i++) {
    const moveName = (fields[`Move ${i}`] || '').trim();
    const moveId = moveNameToId(moveName);

    if (!moveName) {
      errors.push(`Move ${i} is required.`);
    } else if (!validMoveIds.includes(moveId)) {
      errors.push(`Invalid Move ${i} "${moveName}". Must be one of: ${validMoveNames.join(', ')}.`);
    } else {
      moveNames.push(moveName);
      moveIds.push(moveId);
    }
  }

  // Check for duplicate moves
  const uniqueMoveIds = new Set(moveIds);
  if (moveIds.length > 0 && uniqueMoveIds.size !== moveIds.length) {
    errors.push('All three moves must be different.');
  }

  // Validate rarity
  const rarity = (fields['Rarity'] || '').trim().toLowerCase();
  if (!rarity) {
    errors.push('Rarity is required.');
  } else if (!VALID_RARITIES.includes(rarity)) {
    errors.push(`Invalid rarity "${rarity}". Must be one of: ${VALID_RARITIES.join(', ')}.`);
  }

  // Validate theme
  const theme = (fields['Theme'] || '').trim();
  if (!theme) {
    errors.push('Theme is required.');
  }

  // Evolution (optional)
  const evolution = (fields['Evolution (optional)'] || '').trim() || null;

  // Validate color (optional)
  const color = (fields['Color (optional)'] || '').trim();
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    errors.push(`Invalid color "${color}". Must be a hex color like #e74c3c.`);
  }

  // Validate description
  const description = (fields['Description'] || '').trim();
  if (!description) {
    errors.push('Description is required.');
  }

  // Build BugMon object if valid
  let bugmon = null;
  if (errors.length === 0) {
    const defaultColor = typesData.typeColors[type] || '#cccccc';
    bugmon = {
      name,
      type,
      hp: stats.hp,
      attack: stats.attack,
      defense: stats.defense,
      speed: stats.speed,
      moves: moveIds,
      color: color || defaultColor,
      rarity,
      theme,
      evolution,
      description,
    };
  }

  return { valid: errors.length === 0, errors, bugmon };
}

// Main
const issueBody = process.argv[2];
if (!issueBody) {
  console.error('Usage: node validate-submission.js <issue-body>');
  process.exit(1);
}

const result = validate(issueBody);
console.log(JSON.stringify(result));
process.exit(result.valid ? 0 : 1);
