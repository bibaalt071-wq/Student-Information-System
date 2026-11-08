import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {calculateGpa,gradePoint,scale} from '../src/gpa.js';
const source=(await readFile(new URL('../src/main.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
async function boot(role='student',status='active'){
 const dom=new JSDOM('<div id="root"></div><div id="toast" hidden></div>',{url:'https://sis.example.test',runScripts:'outside-only'});
 const w=dom.window,calls=[];
 const me={id:'me',name:'Test <img src=x>',email:'me@example.test',role:role||'student',status,version:1,group_name:'CS-1'};
 const profiles=[me,{id:'teacher',name:'Teacher',role:'teacher',status:'active',email:'t@example.test',version:1},{id:'student',name:'Other Student',role:'student',status:'active',email:'s@example.test',version:1}];
 const tables={profiles,courses:[{id:'c1',name:'Философия',code:'PHI',category:'Жалпы',credits:5,teacher_id:role==='teacher'?'me':'teacher',group_name:'CS-1'},{id:'c2',name:'Жоғары математика',code:'MATH',category:'Математика',credits:5,teacher_id:'teacher'}],enrollments:[{course_id:'c1',student_id:role==='teacher'?'student':'me'}],grades:[{id:'g1',course_id:'c1',student_id:'me',score:90,week:0,assessment:'Exam',version:1}],schedules:[],assignments:[],submissions:[],notices:[],audit_log:[]};
 let authUser=role?{id:'me',email:me.email}:null;
 class Query{
  constructor(table){this.table=table;this.filters=[];this.op='select';this.one=false;}
  select(){return this;}order(){return this;}limit(){return this;}range(){return this;}
  eq(k,v){this.filters.push([k,v]);return this;}single(){this.one=true;return this;}
  insert(row){this.op='insert';this.payload=row;return this;}update(row){this.op='update';this.payload=row;return this;}delete(){this.op='delete';return this;}
  then(resolve,reject){try{let rows=tables[this.table].filter(r=>this.filters.every(([k,v])=>r[k]===v));if(this.op==='insert'){const row={id:'new-id',version:1,...this.payload};tables[this.table].push(row);rows=[row];calls.push(['insert',this.table,this.payload]);}if(this.op==='update'){rows.forEach(r=>Object.assign(r,this.payload,{version:r.version+1}));calls.push(['update',this.table,this.payload]);}return Promise.resolve({data:this.one?rows[0]:rows,error:null}).then(resolve,reject);}catch(e){return Promise.reject(e).then(resolve,reject);}}
 }
 const auth={
  getUser:async()=>({data:{user:authUser},error:null}),
  onAuthStateChange:cb=>{auth.callback=cb;},
  signInWithPassword:async p=>{calls.push(['login',p]);authUser={id:'me',email:me.email};return {data:{user:authUser},error:null}},
  signUp:async p=>{calls.push(['signup',p]);return {data:{},error:null}},
  resetPasswordForEmail:async(...p)=>{calls.push(['reset',...p]);return {data:{},error:null}},
  updateUser:async p=>{calls.push(['updateUser',p]);return {data:{},error:null}},
  signOut:async()=>{authUser=null;return {data:{},error:null}},
  registerPasskey:async()=>{calls.push(['registerPasskey']);return {data:{id:'key'},error:null}},
  signInWithPasskey:async()=>{calls.push(['passkeyLogin']);authUser={id:'me',email:me.email};return {data:{},error:null}},
  passkey:{list:async()=>({data:[{id:'key',friendly_name:'Test passkey',created_at:'2026-01-01'}],error:null}),delete:async()=>({data:null,error:null})}
 };
 const client={auth,from:t=>new Query(t),rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {data:null,error:null}}};
 const checked=r=>{if(r.error)throw r.error;return r.data;};
 Object.assign(w,{client,checked,allRows:async t=>{calls.push(['read',t]);return tables[t]},errorText:e=>e.message||'Error',updateVersioned:async(t,row,p)=>checked(await client.from(t).update(p).eq('id',row.id).eq('version',row.version).select().single()),passkeysEnabled:true,calculateGpa,gradePoint,scale});
 Object.defineProperty(w,'isSecureContext',{value:true});w.PublicKeyCredential=function(){};w.confirm=()=>true;
 w.eval(source);await settle();
 return {dom,w,calls,tables,auth,click:async selector=>{w.document.querySelector(selector).click();await settle();},submit:async selector=>{w.document.querySelector(selector).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();}};
}
async function settle(){for(let i=0;i<15;i++)await Promise.resolve();await new Promise(r=>setImmediate(r));}
test('student pages render escaped names, GPA and scoped actions',async()=>{const a=await boot();try{assert.equal(a.w.document.querySelectorAll('img').length,0);await a.click('[data-page="grades"]');assert.match(a.w.document.body.textContent,/3.67/);assert.equal(a.w.document.querySelector('[data-form="grade"]'),null);await a.click('[data-page="courses"]');assert.equal(a.w.document.querySelectorAll('.course').length,2);assert.equal(a.w.document.querySelector('[data-action="add-course"]'),null);for(const p of ['schedule','assignments','notices','profile'])await a.click(`[data-page="${p}"]`);await a.click('[data-action="register-passkey"]');assert(a.calls.some(c=>c[0]==='registerPasskey'));await a.click('[data-action="list-passkeys"]');assert.match(a.w.document.body.textContent,/Test passkey/);}finally{a.dom.window.close()}});
test('pending accounts never load academic tables',async()=>{const a=await boot('student','pending');try{assert.match(a.w.document.body.textContent,/Бекітуді күтуде/);assert.equal(a.calls.filter(c=>c[0]==='read').length,0)}finally{a.dom.window.close()}});
test('teacher searches assigned courses and saves a grade through backend client',async()=>{const a=await boot('teacher');try{await a.click('[data-page="grades"]');const d=a.w.document;assert.equal(d.querySelectorAll('#grade-course option').length,1);assert.equal(d.querySelector('#grade-student').value,'student');d.querySelector('[name="assessment"]').value='Midterm';d.querySelector('[name="score"]').value='89';await a.submit('[data-form="grade"]');assert(a.calls.some(c=>c[0]==='insert'&&c[1]==='grades'&&c[2].score===89));assert.match(d.querySelector('#toast').textContent,/сақталды/);}finally{a.dom.window.close()}});
test('administrator can open account approvals, course editor and audit',async()=>{const a=await boot('admin');try{await a.click('[data-page="users"]');assert.equal(a.w.document.querySelectorAll('[data-form="access"]').length,2);await a.click('[data-page="courses"]');await a.click('[data-action="add-course"]');assert(a.w.document.querySelector('[name="teacher_id"]'));await a.click('[data-page="audit"]');assert.match(a.w.document.body.textContent,/Өзгерістер журналы/);}finally{a.dom.window.close()}});
test('signup has no role picker; password reset and passkey login use auth service',async()=>{const a=await boot(null);try{await a.click('[data-mode="register"]');const d=a.w.document;assert.equal(d.querySelector('[name="role"]'),null);d.querySelector('[name="name"]').value='Test User';d.querySelector('[name="email"]').value='test@example.test';d.querySelector('[name="password"]').value='test-password-123';await a.submit('[data-form="register"]');const call=a.calls.find(c=>c[0]==='signup');assert.deepEqual(Object.keys(call[1].options.data),['name']);await a.click('[data-mode="reset"]');d.querySelector('[name="email"]').value='test@example.test';await a.submit('[data-form="reset"]');assert(a.calls.some(c=>c[0]==='reset'));await a.click('[data-mode="login"]');await a.click('[data-action="passkey-login"]');assert(a.calls.some(c=>c[0]==='passkeyLogin'));}finally{a.dom.window.close()}});
test('recovery event presents password form and signs out after reset',async()=>{const a=await boot(null);try{a.auth.callback('PASSWORD_RECOVERY',{user:{id:'me'}});const d=a.w.document;assert(d.querySelector('[data-form="newpassword"]'));d.querySelector('[name="password"]').value='new-test-password';await a.submit('[data-form="newpassword"]');assert(a.calls.some(c=>c[0]==='updateUser'));assert(d.querySelector('[data-form="login"]'));}finally{a.dom.window.close()}});
