import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, AlertTriangle, Bell, Building2, Car, CheckCircle2, ClipboardCheck, CircleDollarSign,
  FileText, Fuel, Gauge, LayoutDashboard, LogOut, Menu, Plus, Search, Settings, ShieldCheck,
  Sparkles, Truck, Users, Wrench, X, ChevronRight, LoaderCircle, Upload, RefreshCw
} from 'lucide-react';
import { api } from './api.js';
import './styles.css';
import UserMenu from './UserMenu.jsx';
import { checkoutUrl, planLabel, PLANS } from '../shared/plans.js';

const nav = [
  ['Visão geral', LayoutDashboard], ['Veículos', Car], ['Motoristas', Users], ['Abastecimentos', Fuel],
  ['Manutenção', Wrench], ['Checklists', ClipboardCheck], ['Documentos', FileText], ['Fornecedores', Building2],
  ['Relatórios', Activity], ['Usuários e permissões', ShieldCheck]
];
const operatorNav = new Set(['Visão geral', 'Abastecimentos', 'Manutenção']);
const managerRoles = new Set(['owner', 'admin', 'manager']);
const day = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';
const money = (v=0) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const statusLabel = (s) => ({active:'Disponível',maintenance:'Em manutenção',inactive:'Inativo'}[s] || s);

function Auth({ onAuthenticated, initialMode = 'register' }) {
  const [mode, setMode] = useState(initialMode);
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
      <div className="brand auth-logo"><img className="brand-logo brand-logo-auth" src="/brand/frota-sky-logo-dark.svg" alt="FrotaSky — Gestão inteligente de frotas"/></div>
      <div className="auth-copy"><span className="eyebrow">CONTROLE OPERACIONAL DE VERDADE</span><h1>Sua frota custa dinheiro todos os dias. Veja exatamente onde.</h1><p>Veículos, motoristas, documentos, combustível, manutenção, checklists e custos por veículo em um único painel.</p>
      <div className="auth-benefits"><b><CheckCircle2/> Comece com até 2 veículos grátis</b><b><CheckCircle2/> Sem cartão no cadastro</b><b><CheckCircle2/> Dados separados por empresa</b></div></div>
    </section>
    <section className="auth-card-wrap"><div className="auth-card"><span className="eyebrow">{mode==='register'?'TESTE GRATUITO':'BEM-VINDO DE VOLTA'}</span><h2>{mode==='register'?'Crie sua conta':'Entre na sua operação'}</h2><p>{mode==='register'?'Cadastre sua empresa e o primeiro veículo em poucos minutos.':'Acesse o painel da sua empresa.'}</p>
      <form onSubmit={submit}>
        {mode==='register' && <><label>Seu nome<input name="name" required minLength="2" placeholder="Nome do responsável"/></label><label>Empresa<input name="organizationName" required minLength="2" placeholder="Ex.: Transportes Silva"/></label></>}
        <label>{mode==='register'?'E-mail':'E-mail ou usuário'}<input name="email" type={mode==='register'?'email':'text'} required autoComplete={mode==='register'?'email':'username'} placeholder={mode==='register'?'voce@empresa.com.br':'voce@empresa.com.br ou usuario'}/></label><label>Senha<input name="password" type="password" required minLength={mode==='register'?8:1} autoComplete={mode==='register'?'new-password':'current-password'} placeholder="Mínimo de 8 caracteres"/></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary wide" disabled={loading}>{loading?<><LoaderCircle className="spin" size={17}/> Processando...</>:mode==='register'?'Começar grátis':'Entrar no Frota Sky'}</button>
      </form>
      <button className="auth-switch" onClick={()=>{setMode(mode==='register'?'login':'register');setError('')}}>{mode==='register'?'Já tenho conta — entrar':'Ainda não tenho conta — criar grátis'}</button>
      <small className="auth-legal">Ao continuar, você concorda com o tratamento dos dados necessários para operar sua conta. Estrutura preparada para política de privacidade e LGPD.</small>
    </div></section>
  </div>
}

function App(){
  const [loggingOut,setLoggingOut] = useState(false);
  const [authMode,setAuthMode] = useState('register');
  const [session,setSession] = useState(null); const [boot,setBoot] = useState(true);
  const [active,setActive] = useState('Visão geral'); const [vehicles,setVehicles] = useState([]); const [drivers,setDrivers] = useState([]);
  const [dashboard,setDashboard] = useState(null); const [alerts,setAlerts] = useState([]); const [maintenance,setMaintenance] = useState([]);
  const [fuelEntries,setFuelEntries] = useState([]); const [operators,setOperators] = useState([]);
  const [presetVehicleId,setPresetVehicleId] = useState(''); const [editingOperator,setEditingOperator] = useState(null);
  const [query,setQuery] = useState(''); const [mobileOpen,setMobileOpen] = useState(false); const [modal,setModal] = useState(null);
  const [busy,setBusy] = useState(false); const [toast,setToast] = useState(''); const [pricingNotice,setPricingNotice] = useState('');

  useEffect(()=>{ api.me().then(setSession).catch(()=>{}).finally(()=>setBoot(false)); },[]);
  useEffect(()=>{ if(session?.user?.id) refresh(); },[session?.user?.id, session?.user?.role]);
  async function refresh(){
    try {
      const me = await api.me();
      setSession(me);
      const isOp = me.user?.role === 'driver';
      if (isOp) {
        const [v, db, a, m, fuel] = await Promise.all([api.vehicles(), api.dashboard(), api.alerts(), api.maintenance(), api.fuel()]);
        setVehicles(v.items || []); setDrivers([]); setDashboard(db); setAlerts(a.items || []); setMaintenance(m.items || []); setFuelEntries(fuel.items || []); setOperators([]);
      } else {
        const canManage = managerRoles.has(me.user?.role);
        const jobs = [api.vehicles(), api.drivers(), api.dashboard(), api.alerts(), api.maintenance(), api.fuel()];
        if (canManage) jobs.push(api.operators());
        const [v, d, db, a, m, fuel, ops] = await Promise.all(jobs);
        setVehicles(v.items || []); setDrivers(d.items || []); setDashboard(db); setAlerts(a.items || []); setMaintenance(m.items || []); setFuelEntries(fuel.items || []); setOperators(ops?.items || []);
      }
    } catch(err){ if(err.status===401) setSession(null); else showToast(err.message); }
  }
  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),3200); }
  async function logout(){
    if(loggingOut) return;
    setLoggingOut(true);
    try {
      await api.logout();
      setAuthMode('login');setSession(null);setModal(null);setMobileOpen(false);
      setActive('Visão geral');setQuery('');setVehicles([]);setDrivers([]);
      setDashboard(null);setAlerts([]);setMaintenance([]);setFuelEntries([]);setOperators([]);setEditingOperator(null);setToast('');
    } catch(err) {
      showToast('Não foi possível sair da conta. Tente novamente.');
    } finally { setLoggingOut(false); }
  }
  const filtered = useMemo(()=>vehicles.filter(v=>`${v.plate} ${v.make} ${v.model} ${v.driver_name||''}`.toLowerCase().includes(query.toLowerCase())),[vehicles,query]);
  if(boot) return <div className="boot"><Truck/><LoaderCircle className="spin"/></div>;
  if(!session) return <Auth onAuthenticated={setSession} initialMode={authMode}/>;
  const org=session.organization||{}; const user=session.user||{}; const isOperator=user.role==='driver'; const canManageOperators=managerRoles.has(user.role);
  const fleet=dashboard?.fleet||{}; const costs=dashboard?.costs||{};
  const visibleNav=nav.filter(([label])=>isOperator?operatorNav.has(label):(label!=='Usuários e permissões'||canManageOperators));
  const createLabel=isOperator?({'Visão geral':'Atualizar km','Abastecimentos':'Lançar abastecimento','Manutenção':'Registrar manutenção'}[active]||'Novo registro'):'Novo registro';

  async function saveVehicle(e){ e.preventDefault();setBusy(true); const f=new FormData(e.currentTarget); try{ await api.createVehicle({plate:f.get('plate'),make:f.get('make'),model:f.get('model'),year:Number(f.get('year'))||null,type:f.get('type'),odometerKm:Number(f.get('odometerKm'))||0,primaryDriverId:f.get('primaryDriverId')||null});setModal(null);await refresh();showToast('Veículo cadastrado.'); }catch(err){ if(err.code==='VEHICLE_LIMIT'){ setPricingNotice(err.message); setModal('pricing'); } showToast(err.message);}finally{setBusy(false)} }
  async function saveDriver(e){ e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget);try{await api.createDriver({name:f.get('name'),phone:f.get('phone'),cnhNumber:f.get('cnhNumber'),cnhCategory:f.get('cnhCategory'),cnhExpiresAt:f.get('cnhExpiresAt')||null});setModal(null);await refresh();showToast('Motorista cadastrado.')}catch(err){showToast(err.message)}finally{setBusy(false)} }
  async function saveFuel(e){e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget);try{await api.createFuel({vehicleId:f.get('vehicleId'),driverId:f.get('driverId')||null,liters:Number(f.get('liters')),totalCost:Number(f.get('totalCost')),odometerKm:Number(f.get('odometerKm')),station:f.get('station'),filledAt:new Date().toISOString()});setModal(null);await refresh();showToast('Abastecimento lançado.')}catch(err){showToast(err.message)}finally{setBusy(false)} }
  async function saveMaintenance(e){e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget);try{await api.createMaintenance({vehicleId:f.get('vehicleId'),type:f.get('type')||'corrective',description:f.get('description'),cost:Number(f.get('cost')||0),odometerKm:f.get('odometerKm')===''?null:Number(f.get('odometerKm')),nextDueDate:f.get('nextDueDate')||null,nextDueKm:Number(f.get('nextDueKm'))||null,status:'completed'});setModal(null);await refresh();showToast('Manutenção registrada.')}catch(err){showToast(err.message)}finally{setBusy(false)} }
  async function saveOdometer(e){e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget);try{await api.updateOdometer(f.get('vehicleId'),{odometerKm:Number(f.get('odometerKm'))});setModal(null);await refresh();showToast('Quilometragem atualizada.')}catch(err){showToast(err.message)}finally{setBusy(false)} }
  async function saveOperator(e){e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget);const payload={name:f.get('name'),username:f.get('username'),vehicleId:f.get('vehicleId')};const password=String(f.get('password')||'');if(!editingOperator&&password.length<8){setBusy(false);showToast('A senha deve ter pelo menos 8 caracteres.');return}if(password)payload.password=password;try{if(editingOperator)await api.updateOperator(editingOperator.id,payload);else await api.createOperator(payload);setModal(null);setEditingOperator(null);await refresh();showToast(editingOperator?'Operador atualizado.':'Operador cadastrado. Passe o usuário e a senha para ele entrar.')}catch(err){showToast(err.message)}finally{setBusy(false)} }
  async function setOperatorStatus(operator,status){try{await api.updateOperator(operator.id,{status});await refresh();showToast(status==='active'?'Operador reativado.':'Operador desativado.')}catch(err){showToast(err.message)} }
  function openModal(type, vehicleId){ setPresetVehicleId(vehicleId||vehicles[0]?.id||''); setEditingOperator(null); setModal(type); }
  function openCreate(){ const map={'Veículos':'vehicle','Motoristas':'driver','Abastecimentos':'fuel','Manutenção':'maintenance','Usuários e permissões':'operator','Visão geral':isOperator?'odometer':'vehicle'}; openModal(map[active]||'vehicle'); }
  function editOperator(operator){ setEditingOperator(operator); setPresetVehicleId(operator.vehicles?.[0]?.id||''); setModal('operator'); }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen?'open':''}`}><div className="brand"><img className="brand-logo brand-logo-sidebar" src="/brand/frota-sky-logo-dark.svg" alt="FrotaSky"/></div><button className="close-mobile" onClick={()=>setMobileOpen(false)}><X/></button>
      <div className="company-switch"><div className="avatar">{org.name?.slice(0,2).toUpperCase()}</div><div><b>{org.name}</b><span>{isOperator?'Seu veículo':<>{planLabel(org.plan)}{org.billingStatus==='past_due'?' · em atraso':''}</>} · {vehicles.length}{isOperator||org.vehicleLimit==null?'':` / ${org.vehicleLimit}`} veículos</span></div><ChevronRight size={16}/></div>
      <nav>{visibleNav.map(([label,Icon])=><button key={label} className={active===label?'active':''} onClick={()=>{setActive(label);setMobileOpen(false)}}><Icon size={18}/><span>{label}</span>{label==='Manutenção'&&maintenance.length>0&&<em>{maintenance.length}</em>}</button>)}</nav>
      <div className="sidebar-bottom">{!isOperator&&<button onClick={()=>{setPricingNotice('');setModal('pricing')}}><CircleDollarSign size={18}/> Planos e cobrança</button>}{!isOperator&&<button><Settings size={18}/> Configurações</button>}<button onClick={logout} disabled={loggingOut}><LogOut size={18}/> {loggingOut?'Saindo...':'Sair'}</button></div>
    </aside>
    <main><header className="topbar"><button className="menu-btn" onClick={()=>setMobileOpen(true)}><Menu/></button><div className="top-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={isOperator?'Buscar pela placa do seu veículo...':'Buscar veículo, placa, motorista...'}/></div><div className="top-actions"><button className="icon-btn" onClick={()=>setActive('Visão geral')}><Bell size={19}/>{alerts.some(a=>!a.is_read)&&<i/>}</button><UserMenu user={user} organization={org} onLogout={logout} loggingOut={loggingOut}/></div></header>
      <section className="content"><div className="page-head"><div><p>{isOperator?'SEU VEÍCULO':'OPERAÇÃO EM TEMPO REAL'}</p><h1>{active}</h1><span>{isOperator?'Registre a quilometragem, os abastecimentos e o que estragou na estrada. O restante da frota fica com o gestor.':'Controle operacional, financeiro e preventivo da sua frota em um só lugar.'}</span></div><div className="page-actions"><button className="ghost" onClick={refresh}><RefreshCw size={17}/> Atualizar</button><button className="primary" onClick={openCreate}><Plus size={17}/> {createLabel}</button></div></div>
        {active==='Visão geral'&&isOperator?<OperatorHome vehicles={filtered} fuel={fuelEntries} maintenance={maintenance} costs={costs} alerts={alerts} onKm={(id)=>openModal('odometer',id)} onFuel={(id)=>openModal('fuel',id)} onMaintenance={(id)=>openModal('maintenance',id)} onRead={async id=>{await api.readAlert(id);refresh()}}/>:active==='Visão geral'?<>
          <div className="stats-grid"><Stat icon={Truck} label="Frota monitorada" value={`${Number(fleet.total||0)} veículos`} helper={`${Number(fleet.active||0)} disponíveis`} /><Stat icon={CircleDollarSign} label="Custo no mês" value={money(costs.total)} helper={`${money(costs.fuel)} em combustível`} tone="green"/><Stat icon={Wrench} label="Em manutenção" value={String(Number(fleet.maintenance||0))} helper="Veículos indisponíveis" tone="purple"/><Stat icon={AlertTriangle} label="Alertas" value={String(alerts.filter(a=>!a.is_read).length)} helper="Pendências operacionais" tone="orange"/></div>
          <div className="dashboard-grid"><FleetPanel vehicles={filtered.slice(0,6)} onOpen={()=>setActive('Veículos')}/><AlertsPanel alerts={alerts.slice(0,6)} onRead={async id=>{await api.readAlert(id);refresh()}}/></div>
          <div className="dashboard-grid lower"><section className="panel"><div className="panel-head"><div><h2>Manutenções recentes</h2><p>Histórico operacional</p></div><button className="link" onClick={()=>setActive('Manutenção')}>Abrir módulo <ChevronRight/></button></div><div className="maintenance-list">{maintenance.slice(0,5).map(m=><div className="maint" key={m.id}><div className={`maint-icon ${m.type==='preventive'?'preventive':'corrective'}`}><Wrench size={17}/></div><div><b>{m.description}</b><span>{m.plate} • {m.type==='preventive'?'Preventiva':'Corretiva'}</span></div><div><b>{money(m.cost)}</b><span>{m.status}</span></div></div>)}{!maintenance.length&&<Empty text="Nenhuma manutenção registrada."/>}</div></section>
            <section className="ai-banner"><div className="ai-icon"><Sparkles/></div><div><span>FROTA SKY IA — ROADMAP</span><h3>Base pronta para análises sob demanda.</h3><p>Os dados de consumo, quilometragem e manutenção já estão estruturados para alimentar detecção de anomalias sem manter IA rodando continuamente.</p></div></section></div>
        </>:<Module active={active} vehicles={filtered} drivers={drivers} maintenance={maintenance} fuel={fuelEntries} operators={operators} onEditOperator={editOperator} onOperatorStatus={setOperatorStatus}/>} 
      </section></main>
    {modal && <Modal type={modal} close={()=>{setModal(null);setPricingNotice('');setEditingOperator(null)}} busy={busy} vehicles={vehicles} drivers={drivers} organization={org} user={user} pricingNotice={pricingNotice} presetVehicleId={presetVehicleId} editingOperator={editingOperator} isOperator={isOperator} onVehicle={saveVehicle} onDriver={saveDriver} onFuel={saveFuel} onMaintenance={saveMaintenance} onOdometer={saveOdometer} onOperator={saveOperator}/>} {toast&&<div className="toast">{toast}</div>}
  </div>
}

function Stat({icon:Icon,label,value,helper,tone='blue'}){return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={20}/></div><div><span>{label}</span><strong>{value}</strong><small>{helper}</small></div></div>}
function FleetPanel({vehicles,onOpen}){return <section className="panel fleet-panel"><div className="panel-head"><div><h2>Status da frota</h2><p>Dados reais do D1</p></div><button className="link" onClick={onOpen}>Ver todos <ChevronRight/></button></div><div className="vehicle-table"><div className="tr th"><span>Veículo</span><span>Motorista</span><span>Status</span><span>Odômetro</span><span>Placa</span></div>{vehicles.map(v=><div className="tr" key={v.id}><span className="vehicle"><i><Truck size={18}/></i><b>{v.make} {v.model}<small>{v.type}</small></b></span><span>{v.driver_name||'Não atribuído'}</span><span><em className={`status ${v.status}`}>{statusLabel(v.status)}</em></span><span><b>{Number(v.odometer_km||0).toLocaleString('pt-BR')} km</b></span><span><b>{v.plate}</b></span></div>)}{!vehicles.length&&<Empty text="Cadastre seu primeiro veículo para iniciar a gestão."/>}</div></section>}
function AlertsPanel({alerts,onRead}){return <section className="panel alerts-panel"><div className="panel-head"><div><h2>Alertas</h2><p>Gerados por vencimentos e regras</p></div></div><div className="alerts-list">{alerts.map(a=><button className="alert alert-button" key={a.id} onClick={()=>!a.is_read&&onRead(a.id)}><i className={a.severity==='high'?'danger':'warning'}><AlertTriangle size={17}/></i><div><b>{a.title}</b><span>{a.message}</span></div><small>{a.is_read?'Lido':'Marcar como lido'}</small></button>)}{!alerts.length&&<Empty text="Nenhum alerta pendente."/>}</div></section>}
function Empty({text}){return <div className="empty"><CheckCircle2/><span>{text}</span></div>}
function OperatorHome({vehicles,fuel,maintenance,costs,alerts,onKm,onFuel,onMaintenance,onRead}){
  return <>
    <div className="stats-grid">
      <Stat icon={Gauge} label="Quilometragem" value={vehicles[0]?`${Number(vehicles[0].odometer_km||0).toLocaleString('pt-BR')} km`:'—'} helper={vehicles[0]?.plate||'Sem veículo'}/>
      <Stat icon={Fuel} label="Abastecimentos" value={String(fuel.length)} helper="Do seu veículo" tone="green"/>
      <Stat icon={Wrench} label="Manutenções" value={String(maintenance.length)} helper="Registros na estrada" tone="purple"/>
      <Stat icon={CircleDollarSign} label="Gastos no mês" value={money(costs.total)} helper={`${money(costs.fuel)} em combustível`} tone="orange"/>
    </div>
    {vehicles.map(v=><section className="panel" key={v.id}><div className="panel-head"><div><h2>{v.make} {v.model}</h2><p>{v.plate} · {statusLabel(v.status)} · {Number(v.odometer_km||0).toLocaleString('pt-BR')} km</p></div></div><div className="operator-actions"><button className="primary" onClick={()=>onKm(v.id)}><Gauge size={17}/> Atualizar km</button><button className="ghost" onClick={()=>onFuel(v.id)}><Fuel size={17}/> Abastecimento</button><button className="ghost" onClick={()=>onMaintenance(v.id)}><Wrench size={17}/> Manutenção na estrada</button></div></section>)}
    {!vehicles.length&&<section className="panel"><Empty text="Nenhum veículo atribuído. Peça ao gestor para vincular o seu caminhão ou carro."/></section>}
    {!!alerts.length&&<AlertsPanel alerts={alerts.slice(0,4)} onRead={onRead}/>}
  </>
}
function Module({active,vehicles,drivers,maintenance,fuel=[],operators=[],onEditOperator,onOperatorStatus}){if(active==='Veículos')return <section className="panel"><div className="panel-head"><div><h2>Veículos cadastrados</h2><p>{vehicles.length} registros</p></div></div><div className="cards-list">{vehicles.map(v=><div className="vehicle-card" key={v.id}><div className="car-icon"><Truck/></div><div><b>{v.make} {v.model}</b><span>{v.plate} • {v.driver_name||'Sem motorista'}</span></div><em className={`status ${v.status}`}>{statusLabel(v.status)}</em><div><b>{Number(v.odometer_km||0).toLocaleString('pt-BR')} km</b><span>Odômetro</span></div></div>)}{!vehicles.length&&<Empty text="Nenhum veículo cadastrado."/>}</div></section>;
if(active==='Motoristas')return <section className="panel"><div className="panel-head"><div><h2>Motoristas</h2><p>CNH, categoria e vencimentos</p></div></div><div className="cards-list">{drivers.map(d=><div className="vehicle-card" key={d.id}><div className="car-icon"><Users/></div><div><b>{d.name}</b><span>{d.cnh_number||'CNH não informada'} • Cat. {d.cnh_category||'-'}</span></div><em className={`status ${d.status}`}>{d.status}</em><div><b>{d.cnh_expires_at||'—'}</b><span>Vencimento CNH</span></div></div>)}{!drivers.length&&<Empty text="Nenhum motorista cadastrado."/>}</div></section>;
if(active==='Manutenção')return <section className="panel"><div className="panel-head"><div><h2>Manutenção</h2><p>Preventiva e corretiva</p></div></div><div className="maintenance-list">{maintenance.map(m=><div className="maint" key={m.id}><div className={`maint-icon ${m.type==='preventive'?'preventive':'corrective'}`}><Wrench/></div><div><b>{m.description}</b><span>{m.plate} • {day(m.performed_at)}</span></div><div><b>{money(m.cost)}</b><span>{m.status}</span></div></div>)}{!maintenance.length&&<Empty text="Nenhum histórico de manutenção."/>}</div></section>;
if(active==='Abastecimentos')return <section className="panel"><div className="panel-head"><div><h2>Abastecimentos</h2><p>{fuel.length} lançamentos</p></div></div><div className="maintenance-list">{fuel.map(item=><div className="maint" key={item.id}><div className="maint-icon preventive"><Fuel/></div><div><b>{item.plate} · {Number(item.liters).toLocaleString('pt-BR')} L</b><span>{day(item.filled_at)} · {item.station||'Posto não informado'} · {item.driver_name||'Sem motorista'}</span></div><div><b>{money(item.total_cost)}</b><span>{Number(item.odometer_km||0).toLocaleString('pt-BR')} km</span></div></div>)}{!fuel.length&&<Empty text="Nenhum abastecimento lançado."/>}</div></section>;
if(active==='Usuários e permissões')return <section className="panel"><div className="panel-head"><div><h2>Operadores</h2><p>Cada operador entra com usuário e senha e vê somente o veículo atribuído.</p></div></div><div className="cards-list">{operators.map(o=><div className="vehicle-card operator-card" key={o.id}><div className="car-icon"><Users/></div><div><b>{o.name}</b><span>Usuário: {o.username||'—'} · {o.vehicles.map(v=>`${v.plate} ${v.model}`).join(', ')||'Sem veículo'}</span></div><em className={`status ${o.status==='active'?'active':'inactive'}`}>{o.status==='active'?'Ativo':'Inativo'}</em><div className="member-actions"><button type="button" onClick={()=>onEditOperator(o)}>Editar</button><button type="button" onClick={()=>onOperatorStatus(o,o.status==='active'?'disabled':'active')}>{o.status==='active'?'Desativar':'Reativar'}</button></div></div>)}{!operators.length&&<Empty text="Nenhum operador cadastrado. Crie um usuário e senha e vincule o caminhão ou carro dele."/>}</div></section>;
const info={Checklists:'Endpoint de inspeções + upload R2 disponível no MVP.',Documentos:'Backend de documentos e vencimentos preparado para veículo e motorista.',Fornecedores:'Cadastro de fornecedores disponível na API.',Relatórios:'Dashboard já consolida custo mensal; relatórios avançados entram na próxima etapa.'}[active]||'Módulo preparado.';return <section className="panel module-hero"><div><span className="eyebrow">MÓDULO MVP</span><h2>{active}</h2><p>{info}</p></div><div className="ready-badge"><CheckCircle2/> Backend preparado</div></section>}

function VehicleField({vehicles,presetVehicleId,locked}){if(locked&&vehicles.length===1){const v=vehicles[0];return <><input type="hidden" name="vehicleId" value={v.id}/><p className="locked-vehicle"><Truck size={16}/> {v.plate} — {v.make} {v.model}</p></>}return <label>Veículo<select name="vehicleId" required defaultValue={presetVehicleId||''}><option value="">Selecione</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} — {v.make} {v.model}</option>)}</select></label>}
function Modal({type,close,busy,vehicles,drivers,organization,user,pricingNotice,presetVehicleId,editingOperator,isOperator,onVehicle,onDriver,onFuel,onMaintenance,onOdometer,onOperator}){if(type==='pricing')return <div className="modal-backdrop"><div className="pricing-modal"><button className="modal-close" onClick={close}><X/></button><div className="pricing-head"><span className="eyebrow">PREÇO POR VEÍCULO GERENCIADO</span><h2>Comece grátis. Pague quando sua operação crescer.</h2><p>O teste grátis inclui até 2 veículos. Depois, escolha o nível de gestão que faz sentido para a empresa. Plano atual: {planLabel(organization?.plan)}.</p>{pricingNotice&&<p className="pricing-limit">{pricingNotice}</p>}</div><div className="plans">{PLANS.map(p=><PlanCard key={p.id} plan={p} organization={organization} user={user}/>)}</div><p className="pricing-note">O pagamento abre o checkout seguro da Kiwify. Depois da confirmação, atualize o painel para ver o plano ativo.</p></div></div>;
const lockVehicle=isOperator&&vehicles.length<=1;
let body=null;if(type==='vehicle')body=<form onSubmit={onVehicle}><label>Placa<input name="plate" required placeholder="ABC1D23"/></label><div className="form-row"><label>Marca<input name="make" placeholder="Mercedes-Benz"/></label><label>Modelo<input name="model" required placeholder="Sprinter 417"/></label></div><div className="form-row"><label>Ano<input name="year" type="number" min="1980" max="2100"/></label><label>Tipo<select name="type"><option value="van">Van</option><option value="truck">Caminhão</option><option value="utility">Utilitário</option><option value="pickup">Picape</option><option value="car">Carro</option><option value="other">Outro</option></select></label></div><label>Odômetro atual<input name="odometerKm" type="number" min="0"/></label><label>Motorista principal<select name="primaryDriverId"><option value="">Não atribuir</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><Submit busy={busy} text="Cadastrar veículo"/></form>;
if(type==='driver')body=<form onSubmit={onDriver}><label>Nome<input name="name" required/></label><label>Telefone<input name="phone"/></label><div className="form-row"><label>CNH<input name="cnhNumber"/></label><label>Categoria<input name="cnhCategory" placeholder="B, C, D..."/></label></div><label>Vencimento CNH<input name="cnhExpiresAt" type="date"/></label><Submit busy={busy} text="Cadastrar motorista"/></form>;
if(type==='fuel')body=<form onSubmit={onFuel}><VehicleField vehicles={vehicles} presetVehicleId={presetVehicleId} locked={lockVehicle}/>{!isOperator&&<label>Motorista<select name="driverId"><option value="">Não informado</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}<div className="form-row"><label>Litros<input name="liters" type="number" step="0.01" min="0.01" required/></label><label>Valor total<input name="totalCost" type="number" step="0.01" min="0" required/></label></div><label>Odômetro<input name="odometerKm" type="number" min="0" required/></label><label>Posto<input name="station"/></label><Submit busy={busy} text="Lançar abastecimento"/></form>;
if(type==='maintenance')body=<form onSubmit={onMaintenance}><VehicleField vehicles={vehicles} presetVehicleId={presetVehicleId} locked={lockVehicle}/>{!isOperator&&<label>Tipo<select name="type"><option value="preventive">Preventiva</option><option value="corrective">Corretiva</option></select></label>}{isOperator&&<input type="hidden" name="type" value="corrective"/>}<label>O que aconteceu<input name="description" required placeholder={isOperator?'Ex.: pneu furou na estrada':'Troca de óleo e filtros'}/></label><div className="form-row"><label>Quanto gastou<input name="cost" type="number" step="0.01" min="0" required={!!isOperator}/></label><label>KM atual<input name="odometerKm" type="number" min="0" required={!!isOperator}/></label></div>{!isOperator&&<div className="form-row"><label>Próxima data<input name="nextDueDate" type="date"/></label><label>Próximo KM<input name="nextDueKm" type="number" min="0"/></label></div>}<Submit busy={busy} text="Registrar manutenção"/></form>;
if(type==='odometer')body=<form onSubmit={onOdometer}><VehicleField vehicles={vehicles} presetVehicleId={presetVehicleId} locked={lockVehicle}/><label>Quilometragem<input name="odometerKm" type="number" min="0" required defaultValue={vehicles.find(v=>v.id===(presetVehicleId||vehicles[0]?.id))?.odometer_km??''}/></label><Submit busy={busy} text="Salvar quilometragem"/></form>;
if(type==='operator')body=<form autoComplete="off" onSubmit={onOperator}>{!vehicles.length&&<div className="form-error">Cadastre um veículo antes de criar o operador.</div>}<label>Nome<input name="name" required minLength="2" defaultValue={editingOperator?.name||''} placeholder="Zeca" autoComplete="off"/></label><label>Usuário de acesso<input name="username" required minLength="3" defaultValue={editingOperator?.username||''} placeholder="zeca" autoComplete="off"/></label><label>Senha<input name="password" type="password" autoComplete="new-password" placeholder={editingOperator?'Deixe em branco para manter a senha':'Mínimo de 8 caracteres'}/></label><label>Veículo<select name="vehicleId" required defaultValue={editingOperator?.vehicles?.[0]?.id||''}><option value="">Selecione o caminhão ou carro</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} — {v.make} {v.model}</option>)}</select></label><p className="field-hint">O operador entra só com esse usuário e senha. No aplicativo, aparece apenas o veículo escolhido, para lançar km, abastecimento e manutenção.</p><Submit busy={busy} text={editingOperator?'Salvar operador':'Cadastrar operador'}/></form>;
const titles={vehicle:'Cadastrar veículo',driver:'Cadastrar motorista',fuel:'Novo abastecimento',maintenance:isOperator?'Manutenção na estrada':'Registrar manutenção',odometer:'Atualizar quilometragem',operator:editingOperator?'Editar operador':'Cadastrar operador'};
return <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={close}><X/></button><span className="eyebrow">NOVO REGISTRO</span><h2>{titles[type]}</h2>{body}</div></div>}
function PlanCard({plan,organization,user}){const current=organization?.plan===plan.id; const canBill=!user?.role||user.role==='owner'||user.role==='admin'; const href=checkoutUrl(plan,{email:user?.email,name:user?.name,organizationId:organization?.id}); return <div className={`plan ${plan.featured?'featured':''} ${current?'is-current':''}`}>{plan.featured&&<span className="badge">RECOMENDADO</span>}<h3>{plan.name}</h3><p>{plan.text}</p><div className="price"><small>R$</small><strong>{plan.value.toFixed(2).replace('.',',')}</strong><span>/ veículo / mês</span></div>{current?<button type="button" className={plan.featured?'primary':'ghost'} disabled>Plano atual</button>:canBill?<a className={plan.featured?'primary':'ghost'} href={href} target="_blank" rel="noopener noreferrer">Escolher {plan.name}</a>:<button type="button" className="ghost" disabled>Fale com o responsável</button>}</div>}
function Submit({busy,text}){return <button className="primary wide" disabled={busy}>{busy?<><LoaderCircle className="spin" size={17}/> Salvando...</>:text}</button>}
createRoot(document.getElementById('root')).render(<App/>);
