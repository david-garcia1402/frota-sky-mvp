import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LoaderCircle, LogOut } from 'lucide-react';
import { planLabel } from '../shared/plans.js';

const roles = { owner: 'Proprietário', admin: 'Administrador', manager: 'Gestor', driver: 'Motorista', viewer: 'Visualizador' };

export default function UserMenu({ user, organization, onLogout, loggingOut }) {
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const trigger = useRef(null);
  const role = roles[user.role] || user.role || 'Não informado';

  useEffect(() => {
    if (!open) return;
    function outside(event) {
      if (!container.current?.contains(event.target)) setOpen(false);
    }
    function escape(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <div className="user-menu" ref={container}>
    <button type="button" className="user" ref={trigger} aria-label="Menu do usuário"
      aria-expanded={open} aria-controls="user-account-panel" onClick={() => setOpen(value => !value)}>
      <div className="avatar" aria-hidden="true">{user.name?.slice(0, 2).toUpperCase() || 'US'}</div>
      <span><b>{user.name || 'Minha conta'}</b><small>{role}</small></span>
      <ChevronDown size={16} aria-hidden="true"/>
    </button>
    {open && <section id="user-account-panel" className="user-account-panel" aria-label="Informações da conta">
      <h2>Minha conta</h2>
      <dl>
        <div><dt>Nome</dt><dd>{user.name || 'Não informado'}</dd></div>
        <div><dt>E-mail</dt><dd>{user.email || 'Não informado'}</dd></div>
        <div><dt>Empresa</dt><dd>{organization.name || 'Não informada'}</dd></div>
        <div><dt>Plano</dt><dd>{planLabel(organization.plan)}{organization.billingStatus==='past_due'?' · pagamento em atraso':''}</dd></div>
        <div><dt>Perfil de acesso</dt><dd>{role}</dd></div>
      </dl>
      <button type="button" className="account-logout" onClick={onLogout} disabled={loggingOut}>
        {loggingOut ? <LoaderCircle size={17} className="spin"/> : <LogOut size={17}/>}
        {loggingOut ? 'Saindo...' : 'Sair da conta'}
      </button>
    </section>}
  </div>;
}
