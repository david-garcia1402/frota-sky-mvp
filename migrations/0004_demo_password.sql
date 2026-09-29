UPDATE users
SET password_hash = 'pbkdf2_sha256$100000$RnJvdGFTa3lTZWVkRGVtbzIwMjY=$iPIEywTdj6x7r0adHhpA2VgsEIak58rQf/RbEYoNbUQ=',
    updated_at = datetime('now')
WHERE password_hash = 'pbkdf2_sha256$100000$RnJvdGFTa3lTZWVkRGVtbzIwMjY=$5fux6hrcITVhQwXQgyOJnMTz9sTOjhdTSv9w8DoNRBU='
  AND email IN (
    'admin@frotasky.demo',
    'operacoes@frotasky.demo',
    'gestor@frotasky.demo',
    'motorista@frotasky.demo',
    'viewer@frotasky.demo'
  );
