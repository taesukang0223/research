/**
 * 탭 전환 — 여행 그림일기 / 리서치 보고서
 */

(function () {
  const tabs = [
    { btn: 'tab-research', panel: 'panel-research' },
    { btn: 'tab-travel', panel: 'panel-travel' },
  ];

  function activate(targetBtnId) {
    tabs.forEach(({ btn, panel }) => {
      const btnEl = document.getElementById(btn);
      const panelEl = document.getElementById(panel);
      if (!btnEl || !panelEl) return;

      const isActive = btn === targetBtnId;
      btnEl.classList.toggle('is-active', isActive);
      btnEl.setAttribute('aria-selected', isActive ? 'true' : 'false');
      panelEl.hidden = !isActive;
    });
  }

  tabs.forEach(({ btn }) => {
    const btnEl = document.getElementById(btn);
    if (btnEl) {
      btnEl.addEventListener('click', () => activate(btn));
    }
  });
})();
