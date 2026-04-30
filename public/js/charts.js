/* global Chart */
/**
 * Shared Chart.js theme and factory functions used by every analytics view.
 *
 * Each chart page or hub tile picks a chart type and a payload (the rows
 * returned from `lib/analyticsRepo`) and calls `AnalyticsCharts.create(...)`.
 * Insight badges are computed client-side from the same payload so the colour
 * coding stays consistent across pages.
 */
(function (global) {
  const palette = [
    '#0f766e', '#1d4ed8', '#b86200', '#15803d', '#9333ea',
    '#dc2626', '#0ea5e9', '#65a30d', '#db2777', '#7c2d12',
  ];

  const baseDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 800,
      easing: 'easeOutQuart',
    },
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12 } },
      tooltip: { enabled: true, mode: 'nearest' },
    },
  };

  function colorList(n) {
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(palette[i % palette.length]);
    return out;
  }

  /**
   * Reshapes the skills-gap rows into a stacked-bar dataset.
   *
   * @param {Array<{programme:string, sector:string, value:number}>} rows
   */
  function reshapeSkillsGap(rows) {
    const programmes = Array.from(new Set(rows.map((r) => r.programme))).sort();
    const sectors = Array.from(new Set(rows.map((r) => r.sector))).sort();
    const datasets = sectors.map((sector, idx) => ({
      label: sector,
      backgroundColor: palette[idx % palette.length],
      data: programmes.map((p) => {
        const match = rows.find((r) => r.programme === p && r.sector === sector);
        return match ? match.value : 0;
      }),
    }));
    return { labels: programmes, datasets };
  }

  /**
   * Reshapes the professional-development rows into a multi-series line dataset.
   */
  function reshapeProfessionalDevelopment(rows) {
    const years = Array.from(new Set(rows.map((r) => r.year))).sort();
    const types = Array.from(new Set(rows.map((r) => r.type))).sort();
    const datasets = types.map((type, idx) => ({
      label: type,
      borderColor: palette[idx % palette.length],
      backgroundColor: palette[idx % palette.length] + '33',
      tension: 0.3,
      data: years.map((y) => {
        const match = rows.find((r) => r.year === y && r.type === type);
        return match ? match.value : 0;
      }),
    }));
    return { labels: years, datasets };
  }

  /**
   * Reshapes the curriculum-coverage rows into a radar dataset (one ring per programme).
   */
  function reshapeCurriculumCoverage(rows) {
    const buckets = ['cloud', 'security', 'data', 'design', 'management', 'agile'];
    const datasets = rows.slice(0, 4).map((entry, idx) => ({
      label: entry.programme,
      data: buckets.map((b) => entry.scores[b] || 0),
      backgroundColor: palette[idx % palette.length] + '33',
      borderColor: palette[idx % palette.length],
      pointBackgroundColor: palette[idx % palette.length],
    }));
    return { labels: buckets, datasets };
  }

  /**
   * Builds an insight badge ({level, text}) for a given chart from its rows.
   *
   * @param {string} insightLevel Level identifier from the page controller.
   * @param {string} chartType Chart shape, used as a hint when rules differ by chart.
   * @param {Array<object>} rows Source dataset.
   */
  function computeInsight(insightLevel, chartType, rows) {
    if (!rows || rows.length === 0) {
      return { level: 'healthy', text: 'No data. Adjust filters to populate this chart.' };
    }

    if (insightLevel === 'critical-when-top-share-over-40') {
      const total = rows.reduce((acc, r) => acc + (r.value || 0), 0);
      const top = rows[0];
      const share = total ? Math.round((top.value / total) * 100) : 0;
      if (share >= 40) return { level: 'critical', text: `Critical concentration: ${top.label} = ${share}%` };
      if (share >= 20) return { level: 'significant', text: `Significant lean: ${top.label} = ${share}%` };
      return { level: 'healthy', text: `Healthy spread (top sector ${share}%)` };
    }
    if (insightLevel === 'critical-when-top-share-over-15') {
      const total = rows.reduce((acc, r) => acc + (r.value || 0), 0);
      const top = rows[0];
      const share = total ? Math.round((top.value / total) * 100) : 0;
      if (share >= 15) return { level: 'critical', text: `${top.label} concentrates ${share}% of cohort.` };
      return { level: 'healthy', text: `Top employer share ${share}%, within healthy range.` };
    }
    if (insightLevel === 'rank-coloured') {
      return { level: 'emerging', text: `Top role: ${rows[0].label} (${rows[0].value} alumni).` };
    }
    if (insightLevel === 'retention') {
      const total = rows.reduce((acc, r) => acc + (r.value || 0), 0);
      const top = rows[0];
      const share = total ? Math.round((top.value / total) * 100) : 0;
      return { level: share >= 60 ? 'emerging' : 'significant', text: `${share}% based in ${top.label}.` };
    }
    if (insightLevel === 'critical-when-single-sector-over-60') {
      // For each programme, compute share of top sector.
      const grouped = new Map();
      rows.forEach((r) => {
        const list = grouped.get(r.programme) || [];
        list.push(r);
        grouped.set(r.programme, list);
      });
      let worst = { programme: '', share: 0 };
      grouped.forEach((list, prog) => {
        const total = list.reduce((acc, r) => acc + r.value, 0);
        const top = list.reduce((a, b) => (b.value > a.value ? b : a), list[0]);
        const share = total ? top.value / total : 0;
        if (share > worst.share) worst = { programme: prog, share };
      });
      const pct = Math.round(worst.share * 100);
      if (worst.share >= 0.6) return { level: 'critical', text: `${worst.programme} grads cluster ${pct}% in one sector.` };
      if (worst.share >= 0.4) return { level: 'significant', text: `${worst.programme} cluster: ${pct}% in one sector.` };
      return { level: 'healthy', text: `Most programmes show diverse sector spread.` };
    }
    if (insightLevel === 'slope-trend') {
      const years = Array.from(new Set(rows.map((r) => r.year))).sort();
      const totals = years.map((y) => rows.filter((r) => r.year === y).reduce((acc, r) => acc + r.value, 0));
      if (totals.length >= 2) {
        const delta = totals[totals.length - 1] - totals[0];
        if (delta > 0) return { level: 'emerging', text: `Emerging trend: +${delta} achievements over the period.` };
        if (delta < 0) return { level: 'significant', text: `Declining trend: ${delta} achievements over the period.` };
      }
      return { level: 'healthy', text: 'Stable activity across the period.' };
    }
    if (insightLevel === 'critical-when-axis-under-0.2') {
      const issues = [];
      rows.forEach((entry) => {
        Object.entries(entry.scores || {}).forEach(([axis, score]) => {
          if (score < 0.2) issues.push(`${entry.programme}: ${axis}`);
        });
      });
      if (issues.length) return { level: 'critical', text: `Coverage gaps detected: ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? '…' : ''}` };
      return { level: 'healthy', text: 'All programmes show adequate coverage across competencies.' };
    }
    if (insightLevel === 'year-on-year-delta') {
      if (rows.length < 2) return { level: 'healthy', text: 'Single data point, more cohorts needed to detect a trend.' };
      const first = rows[0];
      const last = rows[rows.length - 1];
      const delta = last.value - first.value;
      return {
        level: delta > 0 ? 'emerging' : delta < 0 ? 'significant' : 'healthy',
        text: `${first.year} to ${last.year}: ${delta >= 0 ? '+' : ''}${delta} alumni`,
      };
    }
    return { level: 'healthy', text: '' };
  }

  /**
   * Build an appropriate Chart.js config from the chart type and dataset rows.
   */
  function buildConfig(chartType, rows) {
    if (chartType === 'doughnut' || chartType === 'pie') {
      return {
        type: chartType,
        data: {
          labels: rows.map((r) => r.label),
          datasets: [{
            data: rows.map((r) => r.value),
            backgroundColor: colorList(rows.length),
            borderColor: 'white',
            borderWidth: 2,
          }],
        },
        options: baseDefaults,
      };
    }
    if (chartType === 'stacked-bar') {
      const reshape = reshapeSkillsGap(rows);
      return {
        type: 'bar',
        data: reshape,
        options: {
          ...baseDefaults,
          scales: {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true },
          },
        },
      };
    }
    if (chartType === 'radar') {
      const reshape = reshapeCurriculumCoverage(rows);
      return {
        type: 'radar',
        data: reshape,
        options: {
          ...baseDefaults,
          scales: { r: { beginAtZero: true, suggestedMax: 1 } },
        },
      };
    }
    if (chartType === 'line') {
      // Two shapes: (cohort-trend) [{year,value}] vs (professional-development) [{year,type,value}]
      const hasType = rows.some((r) => r.type !== undefined);
      const data = hasType ? reshapeProfessionalDevelopment(rows) : {
        labels: rows.map((r) => r.year),
        datasets: [{
          label: 'Alumni',
          data: rows.map((r) => r.value),
          borderColor: palette[0],
          backgroundColor: palette[0] + '33',
          tension: 0.3,
          fill: true,
        }],
      };
      return {
        type: 'line',
        data,
        options: { ...baseDefaults, scales: { y: { beginAtZero: true } } },
      };
    }
    // Default: bar chart. Switch to horizontal layout when labels are
    // numerous or long, which keeps employer/job-title strings legible.
    const longestLabel = rows.reduce((acc, r) => Math.max(acc, String(r.label || '').length), 0);
    const horizontal = rows.length > 5 || longestLabel > 14;
    return {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.label),
        datasets: [{
          label: 'Count',
          data: rows.map((r) => r.value),
          backgroundColor: colorList(rows.length),
          borderRadius: 6,
          barPercentage: 0.85,
          categoryPercentage: 0.85,
        }],
      },
      options: {
        ...baseDefaults,
        indexAxis: horizontal ? 'y' : 'x',
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0, autoSkip: false, maxRotation: horizontal ? 0 : 45, minRotation: 0 } },
          y: { beginAtZero: true, ticks: { autoSkip: false } },
        },
      },
    };
  }

  /**
   * Public factory: instantiates a Chart.js chart and returns the instance.
   */
  function create(canvas, chartType, rows) {
    const config = buildConfig(chartType, rows);
    return new Chart(canvas, config);
  }

  global.AnalyticsCharts = { create, computeInsight };
}(window));
