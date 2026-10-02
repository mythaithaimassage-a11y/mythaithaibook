export const WIX_120_SERVICE = {
  id: 'wix-historical-120', name: 'Thai Traditional Massage (120 min)',
  duration: 120, price: 185, taxRate: 0.13, active: true,
};

export function wixImportServices(services) {
  return [...services.filter((service) => String(service.id) !== WIX_120_SERVICE.id), WIX_120_SERVICE];
}

export function packageSessionCount(name) {
  return /\bpackage\b.*\bx\s*4\s*sessions\b/i.test(name) ? 4 : 1;
}
