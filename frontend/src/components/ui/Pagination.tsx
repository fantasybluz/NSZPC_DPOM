'use client';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export default function Pagination({ page, totalPages, total, pageSize, onPageChange, onPageSizeChange }: PaginationProps) {
  if (totalPages <= 1 && total <= pageSize) return null;

  const pages: (number | string)[] = [];
  const maxShow = 5;
  let start = Math.max(1, page - Math.floor(maxShow / 2));
  let end = Math.min(totalPages, start + maxShow - 1);
  if (end - start + 1 < maxShow) start = Math.max(1, end - maxShow + 1);

  if (start > 1) { pages.push(1); if (start > 2) pages.push('...'); }
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < totalPages) { if (end < totalPages - 1) pages.push('...'); pages.push(totalPages); }

  return (
    <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
      <small className="text-muted">共 {total} 筆</small>
      <div className="d-flex align-items-center gap-2">
        <nav>
          <ul className="pagination pagination-sm mb-0">
            <li className={`page-item ${page <= 1 ? 'disabled' : ''}`}>
              <button className="page-link" onClick={() => onPageChange(page - 1)}>&laquo;</button>
            </li>
            {pages.map((p, i) =>
              typeof p === 'string' ? (
                <li key={`e${i}`} className="page-item disabled"><span className="page-link">...</span></li>
              ) : (
                <li key={p} className={`page-item ${p === page ? 'active' : ''}`}>
                  <button className="page-link" onClick={() => onPageChange(p)}>{p}</button>
                </li>
              )
            )}
            <li className={`page-item ${page >= totalPages ? 'disabled' : ''}`}>
              <button className="page-link" onClick={() => onPageChange(page + 1)}>&raquo;</button>
            </li>
          </ul>
        </nav>
        <select
          className="form-select form-select-sm"
          style={{ width: 'auto' }}
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
        >
          {[10, 20, 50, 100].map(s => (
            <option key={s} value={s}>{s} / 頁</option>
          ))}
        </select>
      </div>
    </div>
  );
}
