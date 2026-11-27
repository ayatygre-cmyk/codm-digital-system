(() => {
  const MARK = 'data-codm-staff-link';
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const labels = ['حسابات الملاكمين', 'حسابات الملاكم', 'حسابات'];

  function dashboardNav() {
    const nodes = [...document.querySelectorAll('button,a,[role="tab"],[role="button"],[data-p]')];
    const account = nodes.find(el => {
      const t = clean(el.textContent);
      return labels.some(label => t === label || t.includes(label));
    });
    if (account) {
      const nav = account.closest('nav,[role="tablist"],.tabs,.nav,.sidebar,aside,section,div');
      return { nav: nav || account.parentElement, account };
    }
    const navs = [...document.querySelectorAll('main nav, main [role="tablist"], main .tabs, main .nav, main aside, main section')];
    const nav = navs.find(el => {
      const t = clean(el.textContent);
      return t.includes('الملاكمين') && (t.includes('البطولات') || t.includes('الاشتراكات') || t.includes('لوحة القيادة'));
    });
    return { nav: nav || null, account: null };
  }

  function addLink() {
    if (document.querySelector('[' + MARK + '="1"]')) return true;
    const { nav, account } = dashboardNav();
    if (!nav) return false;

    const link = document.createElement('a');
    link.href = new URL('./staff.html', document.baseURI).href;
    link.textContent = 'الطاقم الفني';
    link.setAttribute(MARK, '1');
    link.setAttribute('aria-label', 'فتح الملف الفني والإداري للطاقم التدريبي');
    Object.assign(link.style, {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      boxSizing: 'border-box', minHeight: '40px', margin: '4px',
      padding: '10px 14px', border: '1px solid #d5dbe5', borderRadius: '8px',
      font: 'inherit', fontWeight: '700', color: '#24364e',
      background: '#e7ebf1', textDecoration: 'none', cursor: 'pointer'
    });
    if (account && account.parentElement === nav) account.insertAdjacentElement('afterend', link);
    else nav.appendChild(link);
    return true;
  }

  function start() {
    if (addLink()) return;
    const observer = new MutationObserver(() => {
      if (addLink()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('load', () => {
      if (addLink()) observer.disconnect();
    }, { once: true });
    setTimeout(() => observer.disconnect(), 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();