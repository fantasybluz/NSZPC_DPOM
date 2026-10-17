'use client';

// 點側欄的版號進來：看每一版改了什麼
import { useEffect } from 'react';
import { CHANGELOG, UNRELEASED, splitBold } from '@/lib/changelog';
import { APP_VERSION, BUILD_DATE, BUILD_SHA, versionSeen } from '@/lib/version';

function Item({ text }: { text: string }) {
  return <li>{splitBold(text).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}</li>;
}

export default function ChangelogPage() {
  // 看過更新紀錄，側欄的 NEW 就消失
  useEffect(() => { versionSeen.markSeen(); }, []);

  return (
    <div className="changelog">
      <div className="form-section changelog-current">
        <div className="small text-muted">目前版本</div>
        <div className="changelog-version">v{APP_VERSION}</div>
        <div className="small text-muted">{[BUILD_SHA && `建置 ${BUILD_SHA}`, BUILD_DATE].filter(Boolean).join('・')}</div>
      </div>

      {CHANGELOG.map((section) => {
        const unreleased = section.version === UNRELEASED;
        return (
          <section key={section.version} className="form-section changelog-section">
            <h6 className="d-flex align-items-center gap-2 mb-2">
              {unreleased ? '下一版' : `v${section.version}`}
              {section.version === APP_VERSION && <span className="badge bg-primary">目前版本</span>}
              {unreleased && <span className="small text-muted fw-normal">已經上線，還沒發版</span>}
            </h6>
            <ul className="mb-0">
              {section.items.map((item) => <Item key={item} text={item} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
