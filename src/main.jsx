import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, AlertTriangle, Bell, Building2, Car, CheckCircle2, ClipboardCheck, CircleDollarSign,
  FileText, Fuel, Gauge, LayoutDashboard, LogOut, Menu, Plus, Search, Settings, ShieldCheck,
  Sparkles, Truck, Users, Wrench, X, ChevronRight, LoaderCircle, Upload, RefreshCw
} from 'lucide-react';
import { api } from './api.js';
import './styles.css';

const nav = [
  ['Visão geral', LayoutDashboard], ['Veículos', Car], ['Motoristas', Users], ['Abastecimentos', Fuel],
  ['Manutenção', Wrench], ['Checklists', ClipboardCheck], ['Documentos', FileText], ['Fornecedores', Building2],
  ['Relatórios', Activity], ['Usuários e permissões', ShieldCheck]
];
const plans = [
  { id: 'essential', name: 'Essencial', value: 12.90, text: 'Controle básico para sair das planilhas.' },
  { id: 'management', name: 'Gestão', value: 19.90, text: 'Operação completa, custos, OS e checklists.', featured: true },
  { id: 'intelligence', name: 'Inteligência', value: 29.90, text: 'Integrações, automações e IA sob demanda.' },
];
const planLabel = { trial: 'Teste', essential: 'Essencial', management: 'Gestão', intelligence: 'Inteligência' };
const money = (v=0) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const statusLabel = (s) => ({active:'Disponível',maintenance:'Em manutenção',inactive:'Inativo'}[s] || s);

function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState('register');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault(); setError(''); setLoading(true);
    const f = new FormData(e.currentTarget);
    try {
      const data = mode === 'register'
        ? await api.register({ name:f.get('name'), organizationName:f.get('organizationName'), email:f.get('email'), password:f.get('password') })
        : await api.login({ email:f.get('email'), password:f.get('password') });
      onAuthenticated(data);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  return <div className="auth-page">
    <section className="auth-brand">
      <div className="brand auth-logo"><div className="brand-mark"><Truck size={24}/></div><div><strong>Frota<span>Sky</span></strong><small>Gestão inteligente de frotas</small></div></div>
      <div className="auth-copy"><span className="eyebrow">CONTROLE OPERACIONAL DE VERDADE</span><h1>Sua frota custa dinheiro todos os dias. Veja exatamente onde.</h1><p>Veículos, motoristas, documentos, combustível, manutenção, checklists e custos por veículo em um único painel.</p>
      <div className="auth-benefits"><b><CheckCircle2/> Comece com até 2 veículos grátis</b><b><CheckCircle2/> Sem cartão no cadastro</b><b><CheckCircle2/> Dados separados por empresa</b></div></div>
    </section>
    <section className="auth-card-wrap"><div className="auth-card"><span className="eyebrow">{mode==='register'?'TESTE GRATUITO':'BEM-VINDO DE VOLTA'}</span><h2>{mode==='register'?'Crie sua conta':'Entre na sua operação'}</h2><p>{mode==='register'?'Cadastre sua empresa e o primeiro veículo em poucos minutos.':'Acesse o painel da sua empresa.'}</p>
      <form onSubmit={submit}>
        {mode==='register' && <><label>Seu nome<input name="name" required minLength="2" placeholder="Nome do responsável"/></label><label>Empresa<input name="organizationName" required minLength="2" placeholder="Ex.: Transportes Silva"/></label></>}
        <label>E-mail<input name="email" type="email" required placeholder="voce@empresa.com.br"/></label><label>Senha<input name="password" type="password" required minLength="8" placeholder="Mínimo de 8 caracteres"/></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary wide" disabled={loading}>{loading?<><LoaderCircle className="spin" size={17}/> Processando...</>:mode==='register'?'Começar grátis':'Entrar no Frota Sky'}</button>
      </form>
      <button className="auth-switch" onClick={()=>{setMode(mode==='register'?'login':'register');setError('')}}>{mode==='register'?'Já tenho conta — entrar':'Ainda não tenho conta — criar grátis'}</button>
      <small className="auth-legal">Ao continuar, você concorda com o tratamento dos dados necessários para operar sua conta. Estrutura preparada para política de privacidade e LGPD.</small>
    </div></section>
  </div>
}

function App(){
  const [session,setSession] = useState(null); const [boot,setBoot] = useState(true);
  const [active,setActive] = useState('Visão geral'); const [vehicles,setVehicles] = useState([]); const [drivers,setDrivers] = useState([]);
  const [dashboard,setDashboard] = useState(null); const [alerts,setAlerts] = useState([]); const [maintenance,setMaintenance] = useState([]);
  const [query,setQuery] = useState(''); const [mobileOpen,setMobileOpen] = useState(false); const [modal,setModal] = useState(null);
  const [busy,setBusy] = useState(false); const [toast,setToast] = useState(''); const [billing,setBilling] = useState(null);
  const billingReturnStarted = useRef(false);

  useEffect(()=>{ api.me().then(setSession).catch(()=>{}).finally(()=>setBoot(false)); },[]);
  useEffect(()=>{ if(session) refresh(); },[session]);
  useEffect(()=>{
    if(!session || billingReturnStarted.current) return;
    const params = new URLSearchParams(window.location.search);
    if(params.get('billing') !== 'return') return;
    billingReturnStarted.current = true;
    const paymentId = params.get('payment_id') || params.get('collection_id');
    const status = params.get('status') || params.get('collection_status');
    (async()=>{
      try {
        if(paymentId){
          const result = await api.confirmBilling(paymentId);
          setSession(await api.me());
          showToast(result.billingStatus === 'active' ? 'Pagamento aprovado. Plano liberado.' : 'Pagamento ainda não aprovado. O teste grátis continua.');
        } else if(status === 'rejected' || status === 'failure') showToast('Pagamento recusado. O teste grátis continua.');
      } catch(err) { showToast(err.message); }
      finally { window.history.replaceState({}, '', window.location.pathname); }
    })();
  },[session]);
  async function refresh(){
    try { const [v,d,db,a,m] = await Promise.all([api.vehicles(),api.drivers(),api.dashboard(),api.alerts(),api.maintenance()]); setVehicles(v.items||[]);setDrivers(d.items||[]);setDashboard(db);setAlerts(a.items||[]);setMaintenance(m.items||[]); }
    catch(err){ if(err.status===401) setSession(null); else showToast(err.message); }
  }
  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),3200); }
  async function logout(){ await api.logout().catch(()=>{});setSession(null); }
  const filtered = useMemo(()=>vehicles.filter(v=>`${v.plate} ${v.make} ${v.model} ${v.driver_name||''}`.toLowerCase().includes(query.toLowerCase())),[vehicles,query]);
  if(boot) return <div className="boot"><Truck/><LoaderCircle className="spin"/></div>;
  if(!session) return <Auth onAuthenticated={setSession}/>;
  const org=session.organization||{}; const user=session.user||{}; const fleet=dashboard?.fleet||{}; const costs=dashboard?.costs||{};

  async function saveVehicle(e){ e.preventDefault();setBusy(true); const f=new FormData(e.currentTarget); try{ await api.createVehicle({plate:f.get('plate'),make:f.get('make'),model:f.get('model'),year:Number(f.get('year'))||null,type:f.get('type'),odometerKm:Number(f.get('odometerKm'))||0,primaryDriverId:f.get('primaryDriverId')||null});setModal(null);await refresh();showToast('Veículo cadastrado.'); }catch(err){showToast(err.message)}finally{setBusy(false)} }
  async function saveDriver(e){ e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget);try{await api.createDriver({name:f.get('name'),phone:f.get('phone'),cnhNumber:f.get('cnhNumber'),cnhCategory:f.get('cnhCategory'),cnhExpiresAt:f.get('cnhExpiresAt')||null});setModal(null);await refresh();showToast('Motorista cadastrado.')}catch(err){showToast(err.message)}finally{setBusy(false)} }
  async function saveFuel(e){e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget);try{await api.createFuel({vehicleId:f.get('vehicleId'),driverId:f.get('driverId')||null,liters:Number(f.get('liters')),totalCost:Number(f.get('totalCost')),odometerKm:Number(f.get('odometerKm')),station:f.get('station'),filledAt:new Date().toISOString()});setModal(null);await refresh();showToast('Abastecimento lançado.')}catch(err){showToast(err.message)}finally{setBusy(false)} }
  async function saveMaintenance(e){e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget);try{await api.createMaintenance({vehicleId:f.get('vehicleId'),type:f.get('type'),description:f.get('description'),cost:Number(f.get('cost')||0),odometerKm:Number(f.get('odometerKm'))||null,nextDueDate:f.get('nextDueDate')||null,nextDueKm:Number(f.get('nextDueKm'))||null,status:'completed'});setModal(null);await refresh();showToast('Manutenção registrada.')}catch(err){showToast(err.message)}finally{setBusy(false)} }
  function openCreate(){ const map={'Veículos':'vehicle','Motoristas':'driver','Abastecimentos':'fuel','Manutenção':'maintenance'}; setModal(map[active]||'vehicle'); }
  async function choosePlan(plan){
    setBusy(true);
    try {
      const { url } = await api.checkout(plan);
      window.location.assign(url);
    } catch(err) { showToast(err.message); setBusy(false); }
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen?'open':''}`}><div className="brand"><div className="brand-mark"><Truck size={23}/></div><div><strong>Frota<span>Sky</span></strong><small>Gestão inteligente</small></div></div><button className="close-mobile" onClick={()=>setMobileOpen(false)}><X/></button>
      <div className="company-switch"><div className="avatar">{org.name?.slice(0,2).toUpperCase()}</div><div><b>{org.name}</b><span>{vehicles.length} / {org.vehicleLimit == null ? 'sem limite' : org.vehicleLimit} veículos</span></div><ChevronRight size={16}/></div>
      <nav>{nav.map(([label,Icon])=><button key={label} className={active===label?'active':''} onClick={()=>{setActive(label);setMobileOpen(false)}}><Icon size={18}/><span>{label}</span>{label==='Manutenção'&&maintenance.length>0&&<em>{maintenance.length}</em>}</button>)}</nav>
      <div className="sidebar-bottom"><button onClick={()=>{ setModal('pricing'); api.billing().then(setBilling).catch(err=>showToast(err.message)); }}><CircleDollarSign size={18}/> Planos e cobrança</button><button><Settings size={18}/> Configurações</button><button onClick={logout}><LogOut size={18}/> Sair</button></div>
    </aside>
    <main><header className="topbar"><button className="menu-btn" onClick={()=>setMobileOpen(true)}><Menu/></button><div className="top-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar veículo, placa, motorista..."/></div><div className="top-actions"><button className="icon-btn" onClick={()=>setActive('Visão geral')}><Bell size={19}/>{alerts.some(a=>!a.is_read)&&<i/>}</button><button className="user"><div className="avatar">{user.name?.slice(0,2).toUpperCase()}</div><span><b>{user.name}</b><small>{user.role}</small></span></button></div></header>
      <section className="content"><div className="page-head"><div><p>OPERAÇÃO EM TEMPO REAL</p><h1>{active}</h1><span>Controle operacional, financeiro e preventivo da sua frota em um só lugar.</span></div><div className="page-actions"><button className="ghost" onClick={refresh}><RefreshCw size={17}/> Atualizar</button><button className="primary" onClick={openCreate}><Plus size={17}/> Novo registro</button></div></div>
        {active==='Visão geral'?<>
          <div className="stats-grid"><Stat icon={Truck} label="Frota monitorada" value={`${Number(fleet.total||0)} veículos`} helper={`${Number(fleet.active||0)} disponíveis`} /><Stat icon={CircleDollarSign} label="Custo no mês" value={money(costs.total)} helper={`${money(costs.fuel)} em combustível`} tone="green"/><Stat icon={Wrench} label="Em manutenção" value={String(Number(fleet.maintenance||0))} helper="Veículos indisponíveis" tone="purple"/><Stat icon={AlertTriangle} label="Alertas" value={String(alerts.filter(a=>!a.is_read).length)} helper="Pendências operacionais" tone="orange"/></div>
          <div className="dashboard-grid"><FleetPanel vehicles={filtered.slice(0,6)} onOpen={()=>setActive('Veículos')}/><AlertsPanel alerts={alerts.slice(0,6)} onRead={async id=>{await api.readAlert(id);refresh()}}/></div>
          <div className="dashboard-grid lower"><section className="panel"><div className="panel-head"><div><h2>Manutenções recentes</h2><p>Histórico operacional</p></div><button className="link" onClick={()=>setActive('Manutenção')}>Abrir módulo <ChevronRight/></button></div><div className="maintenance-list">{maintenance.slice(0,5).map(m=><div className="maint" key={m.id}><div className={`maint-icon ${m.type==='preventive'?'preventive':'corrective'}`}><Wrench size={17}/></div><div><b>{m.description}</b><span>{m.plate} • {m.type==='preventive'?'Preventiva':'Corretiva'}</span></div><div><b>{money(m.cost)}</b><span>{m.status}</span></div></div>)}{!maintenance.length&&<Empty text="Nenhuma manutenção registrada."/>}</div></section>
            <section className="ai-banner"><div className="ai-icon"><Sparkles/></div><div><span>FROTA SKY IA — ROADMAP</span><h3>Base pronta para análises sob demanda.</h3><p>Os dados de consumo, quilometragem e manutenção já estão estruturados para alimentar detecção de anomalias sem manter IA rodando continuamente.</p></div></section></div>
        </>:<Module active={active} vehicles={filtered} drivers={drivers} maintenance={maintenance} alerts={alerts}/>} 
      </section></main>
    {modal && <Modal type={modal} close={()=>setModal(null)} busy={busy} vehicles={vehicles} drivers={drivers} organization={org} billing={billing} onCheckout={choosePlan} onVehicle={saveVehicle} onDriver={saveDriver} onFuel={saveFuel} onMaintenance={saveMaintenance}/>} {toast&&<div className="toast">{toast}</div>}
  </div>
}

function Stat({icon:Icon,label,value,helper,tone='blue'}){return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={20}/></div><div><span>{label}</span><strong>{value}</strong><small>{helper}</small></div></div>}
function FleetPanel({vehicles,onOpen}){return <section className="panel fleet-panel"><div className="panel-head"><div><h2>Status da frota</h2><p>Dados reais do D1</p></div><button className="link" onClick={onOpen}>Ver todos <ChevronRight/></button></div><div className="vehicle-table"><div className="tr th"><span>Veículo</span><span>Motorista</span><span>Status</span><span>Odômetro</span><span>Placa</span></div>{vehicles.map(v=><div className="tr" key={v.id}><span className="vehicle"><i><Truck size={18}/></i><b>{v.make} {v.model}<small>{v.type}</small></b></span><span>{v.driver_name||'Não atribuído'}</span><span><em className={`status ${v.status}`}>{statusLabel(v.status)}</em></span><span><b>{Number(v.odometer_km||0).toLocaleString('pt-BR')} km</b></span><span><b>{v.plate}</b></span></div>)}{!vehicles.length&&<Empty text="Cadastre seu primeiro veículo para iniciar a gestão."/>}</div></section>}
function AlertsPanel({alerts,onRead}){return <section className="panel alerts-panel"><div className="panel-head"><div><h2>Alertas</h2><p>Gerados por vencimentos e regras</p></div></div><div className="alerts-list">{alerts.map(a=><button className="alert alert-button" key={a.id} onClick={()=>!a.is_read&&onRead(a.id)}><i className={a.severity==='high'?'danger':'warning'}><AlertTriangle size={17}/></i><div><b>{a.title}</b><span>{a.message}</span></div><small>{a.is_read?'Lido':'Marcar como lido'}</small></button>)}{!alerts.length&&<Empty text="Nenhum alerta pendente."/>}</div></section>}
function Empty({text}){return <div className="empty"><CheckCircle2/><span>{text}</span></div>}
function Module({active,vehicles,drivers,maintenance}){if(active==='Veículos')return <section className="panel"><div className="panel-head"><div><h2>Veículos cadastrados</h2><p>{vehicles.length} registros</p></div></div><div className="cards-list">{vehicles.map(v=><div className="vehicle-card" key={v.id}><div className="car-icon"><Truck/></div><div><b>{v.make} {v.model}</b><span>{v.plate} • {v.driver_name||'Sem motorista'}</span></div><em className={`status ${v.status}`}>{statusLabel(v.status)}</em><div><b>{Number(v.odometer_km||0).toLocaleString('pt-BR')} km</b><span>Odômetro</span></div></div>)}{!vehicles.length&&<Empty text="Nenhum veículo cadastrado."/>}</div></section>;
if(active==='Motoristas')return <section className="panel"><div className="panel-head"><div><h2>Motoristas</h2><p>CNH, categoria e vencimentos</p></div></div><div className="cards-list">{drivers.map(d=><div className="vehicle-card" key={d.id}><div className="car-icon"><Users/></div><div><b>{d.name}</b><span>{d.cnh_number||'CNH não informada'} • Cat. {d.cnh_category||'-'}</span></div><em className={`status ${d.status}`}>{d.status}</em><div><b>{d.cnh_expires_at||'—'}</b><span>Vencimento CNH</span></div></div>)}{!drivers.length&&<Empty text="Nenhum motorista cadastrado."/>}</div></section>;
if(active==='Manutenção')return <section className="panel"><div className="panel-head"><div><h2>Manutenção</h2><p>Preventiva e corretiva</p></div></div><div className="maintenance-list">{maintenance.map(m=><div className="maint" key={m.id}><div className={`maint-icon ${m.type==='preventive'?'preventive':'corrective'}`}><Wrench/></div><div><b>{m.description}</b><span>{m.plate} • {m.performed_at?.slice(0,10)}</span></div><div><b>{money(m.cost)}</b><span>{m.status}</span></div></div>)}{!maintenance.length&&<Empty text="Nenhum histórico de manutenção."/>}</div></section>;
const info={Abastecimentos:'Backend pronto para lançamentos de combustível, odômetro e custo por litro.',Checklists:'Endpoint de inspeções + upload R2 disponível no MVP.',Documentos:'Backend de documentos e vencimentos preparado para veículo e motorista.',Fornecedores:'Cadastro de fornecedores disponível na API.',Relatórios:'Dashboard já consolida custo mensal; relatórios avançados entram na próxima etapa.','Usuários e permissões':'RBAC ativo no backend: owner, admin, manager, driver e viewer.'}[active]||'Módulo preparado.';return <section className="panel module-hero"><div><span className="eyebrow">MÓDULO MVP</span><h2>{active}</h2><p>{info}</p></div><div className="ready-badge"><CheckCircle2/> Backend preparado</div></section>}

function Modal({type,close,busy,vehicles,drivers,organization,billing,onCheckout,onVehicle,onDriver,onFuel,onMaintenance}){if(type==='pricing'){ const current = billing?.plan || organization?.plan || 'trial'; const status = billing?.billingStatus || organization?.billingStatus || 'trial'; return <div className="modal-backdrop"><div className="pricing-modal"><button className="modal-close" onClick={close}><X/></button><div className="pricing-head"><span className="eyebrow">PREÇO POR VEÍCULO GERENCIADO</span><h2>Comece grátis. Pague quando sua operação crescer.</h2><p>O teste inclui até 2 veículos. Plano atual: {planLabel[current] || current}.{status==='pending'?' Pagamento em análise. O teste continua até a aprovação.':''}</p></div><div className="plans">{plans.map(p=><div className={`plan ${p.featured?'featured':''}`} key={p.id}>{(current===p.id&&status==='active')?<span className="badge">PLANO ATUAL</span>:p.featured&&<span className="badge">RECOMENDADO</span>}<h3>{p.name}</h3><p>{p.text}</p><div className="price"><small>R$</small><strong>{p.value.toFixed(2).replace('.',',')}</strong><span>/ veículo / mês</span></div><button className={p.featured?'primary':'ghost'} disabled={busy} onClick={()=>onCheckout(p.id)}>{busy?'Abrindo checkout...':`Escolher ${p.name}`}</button></div>)}</div></div></div>;}
let body=null;if(type==='vehicle')body=<form onSubmit={onVehicle}><label>Placa<input name="plate" required placeholder="ABC1D23"/></label><div className="form-row"><label>Marca<input name="make" placeholder="Mercedes-Benz"/></label><label>Modelo<input name="model" required placeholder="Sprinter 417"/></label></div><div className="form-row"><label>Ano<input name="year" type="number" min="1980" max="2100"/></label><label>Tipo<select name="type"><option value="van">Van</option><option value="truck">Caminhão</option><option value="utility">Utilitário</option><option value="pickup">Picape</option><option value="car">Carro</option><option value="other">Outro</option></select></label></div><label>Odômetro atual<input name="odometerKm" type="number" min="0"/></label><label>Motorista principal<select name="primaryDriverId"><option value="">Não atribuir</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><Submit busy={busy} text="Cadastrar veículo"/></form>;
if(type==='driver')body=<form onSubmit={onDriver}><label>Nome<input name="name" required/></label><label>Telefone<input name="phone"/></label><div className="form-row"><label>CNH<input name="cnhNumber"/></label><label>Categoria<input name="cnhCategory" placeholder="B, C, D..."/></label></div><label>Vencimento CNH<input name="cnhExpiresAt" type="date"/></label><Submit busy={busy} text="Cadastrar motorista"/></form>;
if(type==='fuel')body=<form onSubmit={onFuel}><label>Veículo<select name="vehicleId" required><option value="">Selecione</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} — {v.make} {v.model}</option>)}</select></label><label>Motorista<select name="driverId"><option value="">Não informado</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><div className="form-row"><label>Litros<input name="liters" type="number" step="0.01" min="0.01" required/></label><label>Valor total<input name="totalCost" type="number" step="0.01" min="0" required/></label></div><label>Odômetro<input name="odometerKm" type="number" min="0" required/></label><label>Posto<input name="station"/></label><Submit busy={busy} text="Lançar abastecimento"/></form>;
if(type==='maintenance')body=<form onSubmit={onMaintenance}><label>Veículo<select name="vehicleId" required><option value="">Selecione</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} — {v.make} {v.model}</option>)}</select></label><label>Tipo<select name="type"><option value="preventive">Preventiva</option><option value="corrective">Corretiva</option></select></label><label>Descrição<input name="description" required placeholder="Troca de óleo e filtros"/></label><div className="form-row"><label>Custo<input name="cost" type="number" step="0.01" min="0"/></label><label>KM atual<input name="odometerKm" type="number" min="0"/></label></div><div className="form-row"><label>Próxima data<input name="nextDueDate" type="date"/></label><label>Próximo KM<input name="nextDueKm" type="number" min="0"/></label></div><Submit busy={busy} text="Registrar manutenção"/></form>;
return <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={close}><X/></button><span className="eyebrow">NOVO REGISTRO</span><h2>{{vehicle:'Cadastrar veículo',driver:'Cadastrar motorista',fuel:'Novo abastecimento',maintenance:'Registrar manutenção'}[type]}</h2>{body}</div></div>}
function Submit({busy,text}){return <button className="primary wide" disabled={busy}>{busy?<><LoaderCircle className="spin" size={17}/> Salvando...</>:text}</button>}
createRoot(document.getElementById('root')).render(<App/>);
