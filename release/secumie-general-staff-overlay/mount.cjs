'use strict';
// Only this isolated pool is new. The existing Sales Tools pool and staff auth stay intact.
const {Pool}=require('pg');
const {SecumieGeneralAdminRepo}=require('../services/secumieGeneralAdminRepo');
const {createAdminSecumieGeneralRouter}=require('../routes/adminSecumieGeneral');
const PATH='/api/admin/secumie-general/v1';
function config(env){
  if(env.SECUMIE_GENERAL_DB_NAME!=='secumie_general'||
     env.SECUMIE_GENERAL_DB_STAFF_USER!=='secumie_general_staff_prod'||
     env.SECUMIE_GENERAL_DB_HOST!=='127.0.0.1'||
     env.SECUMIE_GENERAL_DB_PORT!=='5432'||
     typeof env.SECUMIE_GENERAL_DB_STAFF_PASSWORD!=='string'||
     env.SECUMIE_GENERAL_DB_STAFF_PASSWORD.length<32)
    throw Error('GENERAL_STAFF_DB_CONFIG_MISMATCH');
  return {database:env.SECUMIE_GENERAL_DB_NAME,user:env.SECUMIE_GENERAL_DB_STAFF_USER,
    password:env.SECUMIE_GENERAL_DB_STAFF_PASSWORD,host:'127.0.0.1',port:5432,max:1,
    connectionTimeoutMillis:5000,idleTimeoutMillis:10000};
}
function mount(app,gate,logger,env=process.env){
  if(!Array.isArray(gate)||gate.length<2||gate.some(x=>typeof x!=='function'))
    throw Error('GENERAL_STAFF_AUTH_GATE_MISMATCH');
  if(env.SECUMIE_GENERAL_ADMIN_ENABLED!=='true'){
    app.use(PATH,...gate,(_req,res)=>res.status(503).json({code:'NOT_READY'}));
    return;
  }
  const pool=new Pool(config(env));
  pool.on('error',()=>logger.error({event:'secumie_general_admin_pool_error'},'General lead database unavailable'));
  app.use(PATH,...gate,createAdminSecumieGeneralRouter(new SecumieGeneralAdminRepo(pool)));
}
module.exports={mount,config};
