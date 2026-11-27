(() => {
  const addStaffLink = () => {
    if (document.querySelector('a[data-codm-staff-link="1"]')) return true;
    const accountsButton = document.querySelector('main nav button[data-p="accounts"]');
    if (!accountsButton || !accountsButton.parentElement) return false;
    const link = document.createElement('a');
    link.href = './staff.html';
    link.textContent = 'الطاقم الفني';
    link.setAttribute('data-codm-staff-link', '1');
    link.setAttribute('aria-label', 'فتح الملف الفني والإداري للطاقم التدريبي');
    Object.assign(link.style, {
      display: 'inline-block',
      padding: '10px 13px',
      borderRadius: '8px',
      font: 'inherit',
      fontWeight: 'bold',
      color: '#24364e',
      background: '#e7ebf1',
      textDecoration: 'none',
      cursor: 'pointer'
    });
    accountsButton.insertAdjacentElement('afterend', link);
    return true;
  };
  if (addStaffLink()) return;
  const observer = new MutationObserver(() => {
    if (addStaffLink()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', addStaffLink, { once: true });
  window.addEventListener('load', addStaffLink, { once: true });
})();