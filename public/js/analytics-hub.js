/* global AnalyticsCharts */
/**
 * Analytics hub thumbnails: instantiates a small Chart.js chart inside each
 * tile so the marker can scan the dashboard at a glance before drilling in.
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
    if (typeof Chart === 'undefined' || !window.AnalyticsCharts) {
      setTimeout(() => location.reload(), 500);
      return;
    }
    document.querySelectorAll('[data-mini-chart]').forEach((wrapper) => {
      const canvas = wrapper.querySelector('canvas');
      if (!canvas) return;
      const chartType = wrapper.dataset.chartType;
      let rows = [];
      try {
        rows = JSON.parse(wrapper.dataset.chartPayload || '[]');
      } catch (err) {
        console.warn('Bad chart payload', err);
      }
      AnalyticsCharts.create(canvas, chartType, rows);
    });
  });
}());
