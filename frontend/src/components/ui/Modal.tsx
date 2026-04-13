'use client';

import { useRef, useEffect, ReactNode } from 'react';

interface ModalProps {
  show: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'lg' | 'xl';
}

export default function Modal({ show, onClose, title, children, footer, size }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (show) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [show]);

  if (!show) return null;

  return (
    <>
      <div className="modal-backdrop fade show" onClick={onClose} ref={backdropRef} />
      <div className="modal fade show d-block" tabIndex={-1} onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}>
        <div className={`modal-dialog ${size ? `modal-${size}` : ''} modal-dialog-scrollable`}>
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title fw-bold">{title}</h5>
              <button type="button" className="btn-close" onClick={onClose} />
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
    </>
  );
}
