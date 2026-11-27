(() => {
  const LINK_MARK = 'data-codm-staff-link';
  const normalize = value => String(value || '').replace(/\\s+/g, ' ').trim();

  function findAccountsButton() {
    const direct = document.querySelector('main nav button[data-p="accounts"], main [data-p="accounts"]');
    if (direct) return direct;

    const candidates = [...document.querySelectorAll('main nav button, main nav a, main button, main [role="tab"]')];
    return candidates.find(el => {
      const label = normalize(el.textContent);
      return label.includes('حسابات الملاكمين') || label === 'حسابات';
    }) || null;
  }

  function addStaffLink() {
    if (document.querySelector('[' + LINK_MARK + '="1"]')) return true;

    const link = document.createElement('a');
    link.href = new URL('./staff.html', document.baseURI).href;
    link.textContent = 'الطاقم الفني';
    link.setAttribute(LINK_MARK, '1');
    link.setAttribute('aria-label', 'فتح الملف الفني والإداري للطاقم التدريبي');
    Object.assign(link.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
      minHeight: '40px',
      margin: '4px',
      padding: '10px 14px',
      border: '1px solid #d5dbe5',
      borderRadius: '8px',
      font: 'inherit',
      fontWeight: '700',
      color: '#24364e',
      background: '#e7ebf1',
      textDecoration: 'none',
      cursor: 'pointer'
    });

    const accountsButton = findAccountsButton();
    if (accountsButton && accountsButton.parentElement) {
      accountsButton.insertAdjacentElement('afterend', link);
      return true;
    }

    const nav = document.querySelector('main nav');
    if (nav) {
      nav.appendChild(link);
      return true;
    }
    return false;
  }

  function start() {
    if (addStaffLink()) return;
    const observer = new MutationObserver(() => {
      if (addStaffLink()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('load', () => {
      if (addStaffLink()) observer.disconnect();
    }, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();