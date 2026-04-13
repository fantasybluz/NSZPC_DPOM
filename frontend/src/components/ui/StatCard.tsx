interface StatCardProps {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | number;
  extra?: React.ReactNode;
}

export default function StatCard({ icon, iconBg, iconColor, label, value, extra }: StatCardProps) {
  return (
    <div className="stat-card p-3">
      <div className="d-flex align-items-center gap-3">
        <div className="stat-icon" style={{ background: iconBg, color: iconColor }}>
          <i className={`bi ${icon}`} />
        </div>
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
          {extra && <div className="small text-muted mt-1">{extra}</div>}
        </div>
      </div>
    </div>
  );
}
