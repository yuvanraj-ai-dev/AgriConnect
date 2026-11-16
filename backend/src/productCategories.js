const labels = {
  FERTILIZER: 'Fertilizer',
  BIO_ORGANIC: 'Bio-Organic Fertilizer',
  SEED: 'Seeds',
  PESTICIDE: 'Pesticide',
  TOOL: 'Tools & Implements',
  OTHER: 'Other',
};

function categoryCode(value) {
  const key = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return Object.keys(labels).find((id) => id === key || labels[id].toUpperCase() === key);
}

function categoryAliases(value) {
  const code = categoryCode(value);
  return code ? [code, labels[code]] : [];
}

function displayCategory(value) {
  return labels[categoryCode(value)] || value;
}

module.exports = { categoryCode, categoryAliases, displayCategory };
