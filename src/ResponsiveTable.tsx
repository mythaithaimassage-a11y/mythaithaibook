import { Children, Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode, type TableHTMLAttributes } from 'react';

type ContentProps = {
  children?: ReactNode; colSpan?: number; className?: string; role?: string; type?: string;
  'aria-label'?: string; 'aria-labelledby'?: string; id?: string; placeholder?: string;
};

function elements(children: ReactNode): ReactElement<ContentProps>[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<ContentProps>(child)) return [];
    return child.type === Fragment ? elements(child.props.children) : [child];
  });
}

function textContent(node: ReactNode): string {
  return Children.toArray(node).map((child) =>
    isValidElement<ContentProps>(child) ? textContent(child.props.children)
      : typeof child === 'string' || typeof child === 'number' ? String(child) : '',
  ).join('');
}

function labelControls(children: ReactNode, label: string): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<ContentProps>(child)) return child;
    if (child.type === Fragment) return cloneElement(child, {}, labelControls(child.props.children, label));
    if (typeof child.type !== 'string') return child;
    if (['input', 'select', 'textarea'].includes(child.type)) {
      const control = child.props['aria-label'] || child.props['aria-labelledby'] || child.props.id
        ? child : cloneElement(child, { 'aria-label': child.props.placeholder || label });
      return child.type === 'input' && ['checkbox', 'radio'].includes(child.props.type || '')
        ? <label className="mobile-table-toggle">{control}<span className="sr-only">{label}</span></label>
        : control;
    }
    if (child.type === 'label') return child;
    return child.props.children ? cloneElement(child, {}, labelControls(child.props.children, label)) : child;
  });
}

export default function ResponsiveTable({ children, className = '', ...props }: TableHTMLAttributes<HTMLTableElement>) {
  const sections = elements(children);
  const head = sections.find((section) => section.type === 'thead');
  const headings = elements(head?.props.children).flatMap((row) => elements(row.props.children));
  return <table {...props} role={props.role || 'table'} className={`mobile-data-table ${className}`}>
    {sections.map((section) => {
      if (section.type !== 'tbody') return section;
      return cloneElement(section, { role: 'rowgroup' }, elements(section.props.children).map((row) => {
        let column = 0;
        return cloneElement(row, { role: 'row' }, elements(row.props.children).map((cell) => {
          const heading = headings[column];
          column += cell.props.colSpan || 1;
          if (cell.type !== 'td') return cell;
          return cloneElement(cell, {
            role: 'cell',
            className: `${cell.props.className || ''}${cell.props.colSpan ? ' mobile-wide-cell' : ''}`,
          }, <>
            {heading && <span aria-hidden="true" className="mobile-cell-label">{heading.props.children}</span>}
            <div className="mobile-cell-content">{labelControls(cell.props.children, textContent(heading?.props.children))}</div>
          </>);
        }));
      }));
    })}
  </table>;
}
