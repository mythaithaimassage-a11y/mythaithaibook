export function portalEntry(pathname = '/') {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/owner') return { mode: 'admin', staffNavigation: true };
  if (path === '/therapist') return { mode: 'therapist', staffNavigation: true };
  return { mode: 'customer', staffNavigation: false };
}
