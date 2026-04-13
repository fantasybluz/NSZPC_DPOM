import { STATUS_MAP, DELIVERY_MAP } from '@/lib/constants';

export function OrderStatusBadge({ status }: { status: string }) {
  const info = STATUS_MAP[status] || { label: status, class: 'bg-secondary' };
  return <span className={`badge ${info.class}`}>{info.label}</span>;
}

export function DeliveryBadge({ status }: { status: string }) {
  if (!status) return null;
  const label = DELIVERY_MAP[status] || status;
  return <span className="badge bg-info text-dark ms-1">{label}</span>;
}
