/* global AnalyticsCharts */
/**
 * Single-chart detail page bootstrapper.
 *
 * Reads the JSON payload embedded in `<script id="chart-data">` by the SSR
 * template, instantiates a Chart.js chart, computes the insight badge, and
 * wires up the "Download PNG" button to save the chart image client-side.
 */
(function () {
  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(() => {
    const payloadEl = document.getElementById('chart-data');
    const canvas = document.getElementById('primary-chart');
    if (!payloadEl || !canvas) return;
    if (typeof Chart === 'undefined' || !window.AnalyticsCharts) {
      console.warn('Chart.js or AnalyticsCharts not yet loaded; retrying.');
      setTimeout(() => location.reload(), 500);
      return;
    }

    const payload = JSON.parse(payloadEl.textContent || '{}');
    const rows = payload.data || [];
    const chart = AnalyticsCharts.create(canvas, payload.chartType, rows);

    const insightEl = document.getElementById('chart-insight');
    if (insightEl) {
      const insight = AnalyticsCharts.computeInsight(payload.insightLevel, payload.chartType, rows);
      insightEl.className = `badge badge-${insight.level}`;
      insightEl.textContent = insight.text;
    }

    document.querySelectorAll('[data-download-png]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = chart.toBase64Image();
        const link = document.createElement('a');
        link.href = url;
        link.download = `${payload.slug || 'chart'}.png`;
        link.click();
      });
    });
  });
}());
