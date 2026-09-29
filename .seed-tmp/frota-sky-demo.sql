PRAGMA foreign_keys = ON;

DELETE FROM organizations
WHERE id = 'org_frotasky_demo_001';

DELETE FROM users
WHERE email IN (
  'admin@frotasky.demo',
  'operacoes@frotasky.demo',
  'gestor@frotasky.demo',
  'motorista@frotasky.demo',
  'viewer@frotasky.demo'
);

INSERT INTO organizations (
  id, name, plan, vehicle_limit, created_at, updated_at
)
VALUES (
  'org_frotasky_demo_001',
  'Sky Logística & Transportes',
  'intelligence',
  50,
  datetime('now','-14 months'),
  datetime('now')
);

INSERT INTO users (
  id, name, email, password_hash, status, created_at, updated_at
)
VALUES
(
  'usr_demo_owner_001',
  'Carlos Eduardo',
  'admin@frotasky.demo',
  'pbkdf2_sha256$100000$RnJvdGFTa3lTZWVkRGVtbzIwMjY=$5fux6hrcITVhQwXQgyOJnMTz9sTOjhdTSv9w8DoNRBU=',
  'active',
  datetime('now','-14 months'),
  datetime('now')
),
(
  'usr_demo_admin_001',
  'Mariana Costa',
  'operacoes@frotasky.demo',
  'pbkdf2_sha256$100000$RnJvdGFTa3lTZWVkRGVtbzIwMjY=$5fux6hrcITVhQwXQgyOJnMTz9sTOjhdTSv9w8DoNRBU=',
  'active',
  datetime('now','-12 months'),
  datetime('now')
),
(
  'usr_demo_manager_001',
  'Rafael Martins',
  'gestor@frotasky.demo',
  'pbkdf2_sha256$100000$RnJvdGFTa3lTZWVkRGVtbzIwMjY=$5fux6hrcITVhQwXQgyOJnMTz9sTOjhdTSv9w8DoNRBU=',
  'active',
  datetime('now','-10 months'),
  datetime('now')
),
(
  'usr_demo_driver_001',
  'João Batista',
  'motorista@frotasky.demo',
  'pbkdf2_sha256$100000$RnJvdGFTa3lTZWVkRGVtbzIwMjY=$5fux6hrcITVhQwXQgyOJnMTz9sTOjhdTSv9w8DoNRBU=',
  'active',
  datetime('now','-7 months'),
  datetime('now')
),
(
  'usr_demo_viewer_001',
  'Fernanda Almeida',
  'viewer@frotasky.demo',
  'pbkdf2_sha256$100000$RnJvdGFTa3lTZWVkRGVtbzIwMjY=$5fux6hrcITVhQwXQgyOJnMTz9sTOjhdTSv9w8DoNRBU=',
  'active',
  datetime('now','-5 months'),
  datetime('now')
);

INSERT INTO organization_members
(id, organization_id, user_id, role)
VALUES
('mem_demo_owner_001','org_frotasky_demo_001','usr_demo_owner_001','owner'),
('mem_demo_admin_001','org_frotasky_demo_001','usr_demo_admin_001','admin'),
('mem_demo_manager_001','org_frotasky_demo_001','usr_demo_manager_001','manager'),
('mem_demo_driver_001','org_frotasky_demo_001','usr_demo_driver_001','driver'),
('mem_demo_viewer_001','org_frotasky_demo_001','usr_demo_viewer_001','viewer');

INSERT INTO drivers (
  id, organization_id, name, phone, cpf,
  cnh_number, cnh_category, cnh_expires_at, status
)
VALUES
('drv_demo_001','org_frotasky_demo_001','João Batista','(47) 99911-1001','11122233301','04851234901','D',date('now','+180 days'),'active'),
('drv_demo_002','org_frotasky_demo_001','Marcos Vinícius','(47) 99911-1002','11122233302','04851234902','D',date('now','+8 days'),'active'),
('drv_demo_003','org_frotasky_demo_001','André Luiz Pereira','(47) 99911-1003','11122233303','04851234903','E',date('now','+25 days'),'active'),
('drv_demo_004','org_frotasky_demo_001','Ricardo Souza','(47) 99911-1004','11122233304','04851234904','C',date('now','+340 days'),'active'),
('drv_demo_005','org_frotasky_demo_001','Paulo Henrique','(47) 99911-1005','11122233305','04851234905','D',date('now','+95 days'),'active'),
('drv_demo_006','org_frotasky_demo_001','Lucas Ferreira','(47) 99911-1006','11122233306','04851234906','B',date('now','+420 days'),'active'),
('drv_demo_007','org_frotasky_demo_001','Roberto Nascimento','(47) 99911-1007','11122233307','04851234907','D',date('now','-10 days'),'blocked');

INSERT INTO vehicles (
  id, organization_id, plate, make, model, year, type,
  odometer_km, status, primary_driver_id, notes
)
VALUES
('veh_demo_001','org_frotasky_demo_001','ABC1D23','Mercedes-Benz','Sprinter 417 CDI',2023,'van',82450,'active','drv_demo_001','Rotas regionais.'),
('veh_demo_002','org_frotasky_demo_001','DEF2E34','Volkswagen','Delivery 11.180',2022,'truck',126820,'active','drv_demo_002','Entregas urbanas.'),
('veh_demo_003','org_frotasky_demo_001','GHI3F45','Mercedes-Benz','Accelo 1016',2021,'truck',178600,'maintenance','drv_demo_003','Em manutenção corretiva.'),
('veh_demo_004','org_frotasky_demo_001','JKL4G56','Iveco','Daily 35-160',2024,'van',38600,'active','drv_demo_004','Unidade nova.'),
('veh_demo_005','org_frotasky_demo_001','MNO5H67','Fiat','Fiorino Endurance',2023,'utility',61750,'active','drv_demo_005','Entregas rápidas.'),
('veh_demo_006','org_frotasky_demo_001','PQR6I78','Toyota','Hilux SRX',2022,'pickup',94350,'active','drv_demo_006','Supervisão operacional.'),
('veh_demo_007','org_frotasky_demo_001','STU7J89','Scania','R450',2020,'truck',412900,'maintenance',NULL,'Em revisão preventiva.'),
('veh_demo_008','org_frotasky_demo_001','VWX8K90','Renault','Master L2H2',2019,'van',229400,'inactive',NULL,'Reserva inativa.');

INSERT INTO suppliers
(id, organization_id, name, category, phone, email, document)
VALUES
('sup_demo_001','org_frotasky_demo_001','Auto Center Norte','Manutenção mecânica','(47) 3371-1100','contato@autocenternorte.demo','11222333000101'),
('sup_demo_002','org_frotasky_demo_001','Diesel Tech Serviços','Motores diesel','(47) 3371-2200','oficina@dieseltech.demo','11222333000102'),
('sup_demo_003','org_frotasky_demo_001','Pneus Vale Sul','Pneus','(47) 3371-3300','vendas@pneusvalesul.demo','11222333000103');

INSERT INTO fuel_entries (
  id, organization_id, vehicle_id, driver_id,
  liters, total_cost, price_per_liter, odometer_km, station, filled_at
)
VALUES
('fuel_demo_001','org_frotasky_demo_001','veh_demo_001','drv_demo_001',62.4,381.89,6.12,80120,'Posto Via Norte',datetime('now','-24 days')),
('fuel_demo_002','org_frotasky_demo_001','veh_demo_002','drv_demo_002',94.8,580.18,6.12,124210,'Posto Via Norte',datetime('now','-23 days')),
('fuel_demo_003','org_frotasky_demo_001','veh_demo_004','drv_demo_004',58.2,356.18,6.12,36410,'Posto Via Norte',datetime('now','-21 days')),
('fuel_demo_004','org_frotasky_demo_001','veh_demo_005','drv_demo_005',43.7,267.44,6.12,59880,'Posto Via Norte',datetime('now','-20 days')),
('fuel_demo_005','org_frotasky_demo_001','veh_demo_006','drv_demo_006',74.1,453.49,6.12,92120,'Posto Via Norte',datetime('now','-18 days')),
('fuel_demo_006','org_frotasky_demo_001','veh_demo_001','drv_demo_001',65.8,406.64,6.18,81300,'Rede Estrada',datetime('now','-14 days')),
('fuel_demo_007','org_frotasky_demo_001','veh_demo_002','drv_demo_002',97.3,601.31,6.18,125440,'Rede Estrada',datetime('now','-13 days')),
('fuel_demo_008','org_frotasky_demo_001','veh_demo_004','drv_demo_004',61.0,376.98,6.18,37520,'Rede Estrada',datetime('now','-11 days')),
('fuel_demo_009','org_frotasky_demo_001','veh_demo_005','drv_demo_005',44.9,277.48,6.18,60730,'Rede Estrada',datetime('now','-10 days')),
('fuel_demo_010','org_frotasky_demo_001','veh_demo_006','drv_demo_006',75.6,467.21,6.18,93260,'Rede Estrada',datetime('now','-9 days')),
('fuel_demo_011','org_frotasky_demo_001','veh_demo_001','drv_demo_001',63.7,398.13,6.25,82450,'Posto Via Norte',datetime('now','-4 days')),
('fuel_demo_012','org_frotasky_demo_001','veh_demo_002','drv_demo_002',96.4,602.50,6.25,126820,'Posto Via Norte',datetime('now','-3 days')),
('fuel_demo_013','org_frotasky_demo_001','veh_demo_004','drv_demo_004',60.3,376.88,6.25,38600,'Posto Via Norte',datetime('now','-2 days')),
('fuel_demo_014','org_frotasky_demo_001','veh_demo_005','drv_demo_005',45.2,282.50,6.25,61750,'Posto Via Norte',datetime('now','-1 day')),
('fuel_demo_015','org_frotasky_demo_001','veh_demo_006','drv_demo_006',71.8,448.75,6.25,94350,'Posto Via Norte',datetime('now','-1 day'));

INSERT INTO maintenance_records (
  id, organization_id, vehicle_id, type,
  description, cost, odometer_km, performed_at,
  next_due_date, next_due_km, supplier_id, status
)
VALUES
('mnt_demo_001','org_frotasky_demo_001','veh_demo_001','preventive','Troca de óleo, filtros e inspeção geral',890,81500,datetime('now','-12 days'),date('now','+75 days'),82500,'sup_demo_001','completed'),
('mnt_demo_002','org_frotasky_demo_001','veh_demo_002','preventive','Revisão do sistema de freios',1450,125900,datetime('now','-8 days'),date('now','+100 days'),136000,'sup_demo_001','completed'),
('mnt_demo_003','org_frotasky_demo_001','veh_demo_003','corrective','Substituição de embreagem',4750,178600,datetime('now','-3 days'),NULL,NULL,'sup_demo_002','in_progress'),
('mnt_demo_004','org_frotasky_demo_001','veh_demo_004','preventive','Troca de óleo e filtros',720,37200,datetime('now','-16 days'),date('now','+80 days'),47200,'sup_demo_001','completed'),
('mnt_demo_005','org_frotasky_demo_001','veh_demo_005','corrective','Substituição das pastilhas de freio',540,60300,datetime('now','-14 days'),NULL,NULL,'sup_demo_001','completed'),
('mnt_demo_006','org_frotasky_demo_001','veh_demo_006','preventive','Alinhamento e balanceamento',390,92800,datetime('now','-7 days'),date('now','+90 days'),102800,'sup_demo_003','completed');

INSERT INTO inspections (
  id, organization_id, vehicle_id, driver_id,
  type, odometer_km, status, notes, checklist_json, inspected_at
)
VALUES
(
  'ins_demo_001',
  'org_frotasky_demo_001',
  'veh_demo_001',
  'drv_demo_001',
  'pre_trip',
  82410,
  'approved',
  'Veículo liberado.',
  '{"pneus":"ok","freios":"ok","luzes":"ok","oleo":"ok"}',
  datetime('now','-1 day')
),
(
  'ins_demo_002',
  'org_frotasky_demo_001',
  'veh_demo_002',
  'drv_demo_002',
  'pre_trip',
  126790,
  'attention',
  'Desgaste no pneu dianteiro.',
  '{"pneus":"attention","freios":"ok","luzes":"ok"}',
  datetime('now','-1 day')
),
(
  'ins_demo_003',
  'org_frotasky_demo_001',
  'veh_demo_003',
  'drv_demo_003',
  'incident',
  178600,
  'blocked',
  'Problema de embreagem.',
  '{"embreagem":"blocked","operacao":"blocked"}',
  datetime('now','-3 days')
);

INSERT INTO documents (
  id, organization_id, entity_type, entity_id,
  kind, number, issued_at, expires_at, notes
)
VALUES
(
  'doc_demo_001',
  'org_frotasky_demo_001',
  'vehicle',
  'veh_demo_001',
  'CRLV',
  'CRLV-2026-001',
  date('now','-8 months'),
  date('now','+150 days'),
  'Documento do veículo.'
),
(
  'doc_demo_002',
  'org_frotasky_demo_001',
  'vehicle',
  'veh_demo_002',
  'Licenciamento',
  'LIC-2026-002',
  date('now','-10 months'),
  date('now','+12 days'),
  'Próximo do vencimento.'
),
(
  'doc_demo_003',
  'org_frotasky_demo_001',
  'driver',
  'drv_demo_002',
  'CNH',
  '04851234902',
  date('now','-4 years'),
  date('now','+8 days'),
  'CNH próxima do vencimento.'
);

INSERT INTO alerts (
  id, organization_id, type, severity,
  title, message, entity_type, entity_id,
  due_at, is_read
)
VALUES
(
  'alt_demo_001',
  'org_frotasky_demo_001',
  'cnh_expiry',
  'high',
  'CNH próxima do vencimento',
  'A CNH de Marcos Vinícius vence em 8 dias.',
  'driver',
  'drv_demo_002',
  datetime('now','+8 days'),
  0
),
(
  'alt_demo_002',
  'org_frotasky_demo_001',
  'maintenance_due',
  'high',
  'Manutenção por quilometragem próxima',
  'ABC1D23 atingiu a faixa da próxima manutenção.',
  'vehicle',
  'veh_demo_001',
  datetime('now'),
  0
),
(
  'alt_demo_003',
  'org_frotasky_demo_001',
  'vehicle_blocked',
  'high',
  'Veículo indisponível',
  'GHI3F45 está em manutenção corretiva.',
  'vehicle',
  'veh_demo_003',
  datetime('now'),
  0
),
(
  'alt_demo_004',
  'org_frotasky_demo_001',
  'inspection_attention',
  'medium',
  'Checklist requer atenção',
  'DEF2E34 apresentou desgaste no pneu dianteiro.',
  'inspection',
  'ins_demo_002',
  datetime('now','+2 days'),
  0
);

INSERT INTO audit_logs (
  id, organization_id, user_id,
  action, entity_type, entity_id,
  metadata_json, created_at
)
VALUES
(
  'aud_demo_001',
  'org_frotasky_demo_001',
  'usr_demo_owner_001',
  'organization.demo_seeded',
  'organization',
  'org_frotasky_demo_001',
  '{"source":"seed"}',
  datetime('now')
),
(
  'aud_demo_002',
  'org_frotasky_demo_001',
  'usr_demo_manager_001',
  'maintenance.created',
  'maintenance',
  'mnt_demo_003',
  '{"type":"corrective"}',
  datetime('now','-3 days')
);

UPDATE users SET username = 'joao' WHERE id = 'usr_demo_driver_001';
UPDATE drivers SET user_id = 'usr_demo_driver_001' WHERE id = 'drv_demo_001';
INSERT INTO operator_vehicles (id, organization_id, user_id, vehicle_id)
VALUES ('opv_demo_001', 'org_frotasky_demo_001', 'usr_demo_driver_001', 'veh_demo_001');

