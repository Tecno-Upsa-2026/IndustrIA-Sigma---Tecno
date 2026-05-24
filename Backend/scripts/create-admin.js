// Run once: node scripts/create-admin.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url     = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) {
  console.error('❌  SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no encontradas en .env');
  process.exit(1);
}

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN_EMAIL    = 'flavialozadar@gmail.com';
const ADMIN_PASSWORD = 'Prueba123456';

// Check if user already exists
const { data: existing } = await admin.auth.admin.listUsers();
const found = existing?.users?.find(u => u.email === ADMIN_EMAIL);

if (found) {
  // Update password in case it changed
  await admin.auth.admin.updateUserById(found.id, {
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { name: 'Flavia Lozada', role: 'Administrator', access: 'Total' },
  });
  console.log('✅  Admin ya existía — contraseña y metadata actualizados');
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  process.exit(0);
}

const { data, error } = await admin.auth.admin.createUser({
  email:         ADMIN_EMAIL,
  password:      ADMIN_PASSWORD,
  email_confirm: true,
  user_metadata: { name: 'Flavia Lozada', role: 'Administrator', access: 'Total' },
});

if (error) {
  console.error('❌  Error al crear admin:', error.message);
  process.exit(1);
}

console.log('✅  Cuenta admin creada correctamente');
console.log(`   ID:       ${data.user.id}`);
console.log(`   Email:    ${ADMIN_EMAIL}`);
console.log(`   Password: ${ADMIN_PASSWORD}`);
console.log('\n  Ya podés iniciar sesión en la app.');
