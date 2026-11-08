import {createClient} from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL?.trim();
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const passkeysEnabled=import.meta.env.VITE_ENABLE_PASSKEYS==='true';
function safeConfig(){
  if(!url||!key)return false;
  try { if(new URL(url).protocol!=='https:')return false; } catch{return false;}
  if(key.startsWith('sb_secret_'))return false;
  if(key.includes('.')){try{if(JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role!=='anon')return false;}catch{return false;}}
  return true;
}
// Sessions stay in this tab. PKCE verifiers are shared across tabs so email
// confirmation/recovery links can open in another tab of the same browser.
const authStorage={
 getItem:k=>(k.endsWith('-code-verifier')?localStorage:sessionStorage).getItem(k),
 setItem:(k,v)=>(k.endsWith('-code-verifier')?localStorage:sessionStorage).setItem(k,v),
 removeItem:k=>(k.endsWith('-code-verifier')?localStorage:sessionStorage).removeItem(k)
};
export const client=safeConfig()?createClient(url,key,{auth:{storage:authStorage,storageKey:'sis-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',experimental:{passkey:passkeysEnabled}}}):null;
export function checked(result){if(result.error)throw result.error;return result.data;}
export async function allRows(table){
  const rows=[];let offset=0;
  while(true){let query=client.from(table).select('*').order(table==='enrollments'?'course_id':'id');if(table==='enrollments')query=query.order('student_id');const data=checked(await query.range(offset,offset+499));rows.push(...data);if(data.length<500)return rows;offset+=500;}
}
export function errorText(err){
  const c=err?.code;
  if(c==='file_too_large')return 'Файл көлемі 10 МБ-тан аспауы керек.';
  if(c==='unsupported_file_type')return 'PDF, TXT, PNG, JPG, ZIP, DOCX, PPTX немесе XLSX файлын таңдаңыз.';
  if(c==='23505')return 'Бұл жазба бұрын сақталған. Бетті жаңартып тексеріңіз.';
  if(c==='23503')return 'Байланысты бағалар немесе тапсырмалар бар. Жазбаны жою мүмкін емес.';
  if(c==='42501')return 'Бұл әрекетке рұқсатыңыз жоқ. Әкімшіге хабарласыңыз.';
  if(c==='PGRST116')return 'Жазба өзгерген немесе қолжетімсіз. Жаңартып, қайта көріңіз.';
  if(c==='invalid_credentials')return 'Email немесе құпиясөз қате.';
  if(c==='email_not_confirmed')return 'Email-ге келген растау сілтемесін ашыңыз.';
  if(c==='over_email_send_rate_limit'||c==='over_request_rate_limit')return 'Сұрау тым көп. Біраздан кейін қайта көріңіз.';
  if(c==='passkey_disabled')return 'Passkey әзірге қосылмаған. Email және құпиясөз арқылы кіріңіз.';
  if(err?.name==='NotAllowedError')return 'Passkey сұрауы тоқтатылды немесе уақыт аяқталды.';
  if(String(err?.message).includes('fetch'))return 'Серверге қосылмады. Интернетті тексеріңіз.';
  return 'Әрекет орындалмады. Деректерді тексеріп, қайта көріңіз. '+(c?`(${c})`:'');
}
export async function updateVersioned(table,row,patch){return checked(await client.from(table).update(patch).eq('id',row.id).eq('version',row.version).select().single());}
