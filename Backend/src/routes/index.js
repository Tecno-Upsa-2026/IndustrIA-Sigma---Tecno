import { Router } from 'express';
import auth       from './auth.js';
import dashboard  from './dashboard.js';
import machines   from './machines.js';
import alerts     from './alerts.js';
import spc        from './spc.js';
import lss        from './lss.js';
import simulator  from './simulator.js';
import reports    from './reports.js';
import config     from './config.js';
import ai         from './ai.js';
import search     from './search.js';
import profile    from './profile.js';

const router = Router();

router.use('/auth',      auth);
router.use('/dashboard', dashboard);
router.use('/machines',  machines);
router.use('/alerts',    alerts);
router.use('/spc',       spc);
router.use('/lss',       lss);
router.use('/simulator', simulator);
router.use('/reports',   reports);
router.use('/config',    config);
router.use('/ai',        ai);
router.use('/search',    search);
router.use('/profile',   profile);

// Health
router.get('/health', (_, res) => res.json({ ok:true, ts: Date.now() }));

export default router;
