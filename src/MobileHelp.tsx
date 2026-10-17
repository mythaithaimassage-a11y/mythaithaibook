import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { useTranslation } from './localization';

export default function MobileHelp({ children }: { children: ReactNode }) {
  const { translate: tr } = useTranslation();
  return <div className="mobile-help">
    <details className="lg:hidden">
      <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-inherit">
        <Info aria-hidden="true" className="h-4 w-4" />{tr('Help')}
      </summary>
      <div className="pb-2 text-sm">{children}</div>
    </details>
    <div className="hidden lg:block">{children}</div>
  </div>;
}
