import React, { useEffect, useState } from 'react';
import './Documentation.css';

/*
 * The building blocks of the guide pages (Documentation, VR integration): a
 * sticky table of contents on the left, one long page of linkable sections on
 * the right. Shared so every guide page reads as part of the same document.
 */

export function Anchor({ id, children }) {
  return (
    <h2 id={id} className="doc-h2">
      <a href={`#${id}`} className="doc-anchor" aria-hidden="true">#</a>
      {children}
    </h2>
  );
}

export function Callout({ kind = 'note', title, children }) {
  return (
    <div className={`doc-callout is-${kind}`}>
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

export function SpecTable({ rows }) {
  return (
    <table className="doc-table">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The table of contents, highlighting the section being read. */
export function DocSidebar({ label, sections }) {
  const [active, setActive] = useState(sections[0].id);

  useEffect(() => {
    const root = document.querySelector('.doc-content');
    if (!root) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { root, rootMargin: '0px 0px -70% 0px' },
    );
    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  return (
    <aside className="doc-sidebar" aria-label="Contents">
      <div className="doc-sidebar-head">
        <span>{label}</span>
      </div>
      <nav>
        <ul>
          {sections.map(({ id, title }) => (
            <li key={id}>
              <a href={`#${id}`} className={active === id ? 'is-active' : ''}>{title}</a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
