const db = require('../../db');
const analyticsRepo = require('../../lib/analyticsRepo');
const { readStandardFilters } = require('../../lib/analyticsFilters');
const { setFlash } = require('../../lib/flash');
const { getFilterPresetsForUser } = require('../../lib/repositories');

const showDirectory = (req, res) => {
  const filters = readStandardFilters(req.query);
  const result = analyticsRepo.getAlumniDirectory(filters, {
    page: req.query.page,
    pageSize: req.query.pageSize,
  });
  const filterOptions = analyticsRepo.getFilterOptions();
  const presets = getFilterPresetsForUser(req.user.id);

  res.render('alumni', {
    title: 'Alumni directory',
    filters,
    filterOptions,
    presets,
    result,
  });
};

const submitFilterPreset = (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) {
    setFlash(req, 'error', 'Preset name is required.');
    return res.redirect('/alumni');
  }
  const filters = readStandardFilters(req.body);
  db.prepare(`
    INSERT INTO analytics_filter_presets (user_id, name, filters_json)
    VALUES (?, ?, ?)
  `).run(req.user.id, name, JSON.stringify(filters));
  setFlash(req, 'success', `Preset "${name}" saved.`);
  return res.redirect('/alumni');
};

const deleteFilterPreset = (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM analytics_filter_presets WHERE id = ? AND user_id = ?').run(id, req.user.id);
  setFlash(req, 'success', 'Preset removed.');
  return res.redirect('/alumni');
};

module.exports = {
  deleteFilterPreset,
  showDirectory,
  submitFilterPreset,
};
