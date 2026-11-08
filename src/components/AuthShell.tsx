import type { ReactNode } from "react";

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-bg">
      <div className="auth-embers" aria-hidden="true" />
      <section className="auth-hero">
        <div className="auth-crest" aria-hidden="true">⚔</div>
        <h2 className="auth-logo">Эльдория</h2>
        <p className="auth-logo-sub">Клинки Рассвета</p>
        <ul className="auth-points">
          <li>Восемь классов — от воина и ассасина до заклинателя и укротителя</li>
          <li>Ночные нападения на поселения и охотники — следите за ними на карте</li>
          <li>Ваши герои и их внешность хранятся на сервере</li>
        </ul>
      </section>
      <div className="auth-side">{children}</div>
    </main>
  );
}
