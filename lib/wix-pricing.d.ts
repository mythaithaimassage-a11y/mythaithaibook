type Service = { id: string | number; name: string; duration: number; price: number; taxRate: number; active: boolean };
export const WIX_120_SERVICE: Service;
export function wixImportServices(services: Service[]): Service[];
export function packageSessionCount(name: string): number;
