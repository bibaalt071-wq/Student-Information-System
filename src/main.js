import './style.css';
import './server.css';
import {client,checked,allRows,errorText,updateVersioned,passkeysEnabled} from './client.js';
import {calculateGpa,gradePoint,scale} from './gpa.js';

const root=document.querySelector('#root');
const roles={student:'Студент',teacher:'Оқытушы',admin:'Әкімші'};
const statuses={pending:'Бекітуді күтуде',active:'Белсенді',suspended:'Бұғатталған'};
const days=['','Дүйсенбі','Сейсенбі','Сәрсенбі','Бейсенбі','Жұма','Сенбі','Жексенбі'];
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={user:null,profile:null,page:'home',mode:'login',busy:false,recovery:false,editingCourse:null,courseEditor:false,query:'',data:{},passkeys:[]};
let generation=0,toastTimer;
const data=table=>state.data[table]||[];
const course=id=>data('courses').find(c=>c.id===id);
const person=id=>data('profiles').find(p=>p.id===id);
const isAdmin=()=>state.profile?.role==='admin';
const isStaff=()=>['admin','teacher'].includes(state.profile?.role);
const teaching=()=>data('courses').filter(c=>isAdmin()||c.teacher_id===state.user.id);
const enrolled=cid=>data('enrollments').some(e=>e.course_id===cid&&e.student_id===state.user.id);
const title=(h,p='')=>`<div class="page-title"><div><h1>${escape(h)}</h1><p class="subtitle">${escape(p)}</p></div><button class="ghost" data-action="refresh">↻ Жаңарту</button></div>`;
const stat=(label,value,icon)=>`<div class="stat"><span class="muted">${icon} ${escape(label)}</span><div class="big">${escape(value)}</div></div>`;
const empty=text=>`<div class="empty">${escape(text)}</div>`;
const option=(value,label,selected)=>`<option value="${escape(value)}" ${value===selected?'selected':''}>${escape(label)}</option>`;
const courseOptions=(items=teaching(),selected)=>items.map(c=>option(c.id,`${c.name} · ${c.code}`,selected)).join('');
const teacherName=c=>person(c.teacher_id)?.name||'Оқытушы тағайындалмаған';
const formField=(label,name,type='text',value='',extra='')=>`<div><label for="${escape(name)}">${escape(label)}</label><input id="${escape(name)}" name="${escape(name)}" type="${type}" value="${escape(value)}" ${extra}></div>`;
function message(text,error=false){const el=document.querySelector('#toast');el.textContent=text;el.hidden=false;el.className='toast'+(error?' error-toast':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true},7000);}
function formValues(form){return Object.fromEntries(new FormData(form));}
function supportedPasskeys(){return passkeysEnabled&&window.isSecureContext&&!!window.PublicKeyCredential;}
function authScreen(){
 const m=state.recovery?'newpassword':state.mode;
 const names={login:'Жүйеге кіру',register:'Тіркелу',reset:'Құпиясөзді қалпына келтіру',newpassword:'Жаңа құпиясөз'};
 root.innerHTML=`<section class="auth"><div class="auth-left"><div class="pill">🎓 SIS • Университет жүйесі</div><h1>Білім жолыңыз — бір жүйеде</h1><p>Пәндер, тапсырмалар және оқу нәтижелері. Студент пен оқытушыға арналған ортақ кеңістік.</p></div><div class="auth-right"><div class="auth-panel"><div class="brand"><span class="logo">⬡</span>SIS</div><h2>${names[m]}</h2><p class="muted">${m==='register'?'Email-ді растағаннан кейін әкімші аккаунтыңызды бекітеді.':'Университет платформасына қош келдіңіз'}</p><form data-form="${m}">${m==='register'?formField('Аты-жөні','name','text','','required minlength="2" maxlength="100" autocomplete="name"'):''}${m!=='newpassword'?formField('Email','email','email','','required autocomplete="email"'):''}${m!=='reset'?formField(m==='newpassword'?'Жаңа құпиясөз':'Құпиясөз','password','password','',`required minlength="${m==='login'?1:12}" autocomplete="${m==='login'?'current-password':'new-password'}"`):''}<button class="primary full">${m==='reset'?'Сілтемені жіберу':m==='newpassword'?'Құпиясөзді сақтау':names[m]}</button></form>${m==='login'&&supportedPasskeys()?'<button class="ghost full" data-action="passkey-login">Face ID / Touch ID арқылы кіру</button><p class="auth-help">Бұрын профильге қосылған passkey қажет. Құрылғы PIN-кодты да ұсына алады.</p>':''}<div class="switch">${m==='login'?'<button class="link" data-mode="register">Тіркелу</button> · <button class="link" data-mode="reset">Құпиясөзді ұмыттым</button>':m!=='newpassword'?'<button class="link" data-mode="login">Кіру бетіне оралу</button>':''}</div><div id="auth-feedback" role="status" class="auth-help"></div></div></div></section>`;
}
function pendingScreen(){root.innerHTML=`<main class="waiting"><div class="card"><div class="brand">⬡ SIS</div><h1>${escape(statuses[state.profile.status])}</h1><p>${state.profile.status==='pending'?'Аккаунтыңыз тіркелді. Әкімші оқу орныңыздағы рөліңіз бен тобыңызды тексергеннен кейін жүйені пайдалана аласыз.':'Қолжетімділігіңіз уақытша тоқтатылған. Оқу орнының әкімшісіне хабарласыңыз.'}</p><p>${escape(state.profile.email)}</p><div class="inline-actions"><button class="primary" data-action="refresh">Күйін тексеру</button><button class="ghost" data-action="logout">Шығу</button></div></div></main>`;}
function menu(){return [['home','⌂','Басты бет'],['courses','▣','Пәндер'],['grades','◇',isStaff()?'Бағалар / баға қою':'Бағалар және GPA'],['schedule','▦','Сабақ кестесі'],['assignments','▤','Оқу жоспары'],['notices','♧','Хабарламалар'],...(isAdmin()?[['users','♟','Пайдаланушылар'],['audit','↺','Өзгерістер журналы']]:[]),['profile','♙','Профиль және кіру']];}
function render(){
 if(!client){root.innerHTML='<main class="waiting"><div class="card"><div class="brand">⬡ SIS</div><h1>Жүйе бапталуда</h1><p>Платформа серверге әлі қосылмаған. Әкімші баптауды аяқтағаннан кейін тіркелу қолжетімді болады.</p></div></main>';return;}
 if(!state.user||state.recovery){authScreen();return;}
 if(!state.profile){root.innerHTML='<main class="waiting"><div class="card"><h1>Профиль жүктелмеді</h1><p>Байланысты тексеріп, қайталап көріңіз.</p><button class="primary" data-action="refresh">Қайталау</button> <button class="ghost" data-action="logout">Шығу</button></div></main>';return;}
 if(state.profile.status!=='active'){pendingScreen();return;}
 if(!menu().some(([id])=>id===state.page))state.page='home';
 root.innerHTML=`<section class="app"><aside class="sidebar" id="sidebar"><div class="brand"><span class="logo">⬡</span>SIS</div><nav class="nav">${menu().map(([id,ic,text])=>`<button data-page="${id}" class="${state.page===id?'active':''}"><span>${ic}</span>${text}</button>`).join('')}</nav><div class="sidebar-footer">SIS • Университет<br>Жеке оқу кабинеті</div></aside><div class="main"><header class="topbar"><button class="ghost mobile-menu" data-action="menu" aria-label="Мәзірді ашу">☰</button><span class="brand" style="font-size:16px">SIS</span><div class="user"><span class="avatar">👤</span><div><strong>${escape(state.profile.name)}</strong><br><small class="muted">${roles[state.profile.role]}</small></div><button class="ghost small" data-action="logout">Шығу</button></div></header><main class="content" id="content">${pageContent()}</main></div></section>`;
}
function pageContent(){switch(state.page){case 'home':return home();case 'courses':return courses();case 'grades':return grades();case 'schedule':return schedule();case 'assignments':return assignments();case 'notices':return notices();case 'users':return users();case 'profile':return profile();case 'audit':return audit();default:return '';}}
function home(){const g=calculateGpa(data('courses'),data('grades'),state.user.id);return `<div class="hero"><div><h2>Қош келдіңіз, ${escape(state.profile.name)}!</h2><p>${isStaff()?'Оқу процесі мен нәтижелерін басқарыңыз':'Бүгінгі қадам — ертеңгі мүмкіндік'}</p></div><span class="hero-emoji">🎓</span></div><div class="stats">${stat(isStaff()?'Менің пәндерім':'Ағымдағы GPA / 4.00',isStaff()?teaching().length:g.display,'📊')+stat('Қолжетімді пәндер',data('courses').length,'📚')+stat('Баға жазбалары',data('grades').length,'⭐')+stat('Тапсырмалар',data('assignments').length,'📝')}</div><div class="card"><h3>Жылдам әрекеттер</h3><div class="inline-actions"><button class="primary" data-page="grades">${isStaff()?'Баға қою':'GPA және бағалар'}</button><button class="ghost" data-page="assignments">Оқу жоспары</button><button class="ghost" data-page="profile">Face ID / Touch ID баптау</button></div></div>${notices(false)}`;}
function courses(){
 const ec=data('courses').find(c=>c.id===state.editingCourse)||{};
 const query=state.query.toLowerCase();const filtered=data('courses').filter(c=>(c.name+' '+c.code+' '+c.category).toLowerCase().includes(query));
 return title('Университет пәндері','Жалпы және мамандық пәндері')+`<div class="catalog-toolbar"><label class="sr-only" for="catalog-search">Пәнді іздеу</label><input id="catalog-search" type="search" placeholder="Пән атауы, коды немесе бағыты" value="${escape(state.query)}">${isAdmin()?'<button class="primary" data-action="add-course">＋ Пән қосу</button>':''}</div>`+(isAdmin()&&state.courseEditor?`<section class="course-editor-card"><h3>${ec.id?'Пәнді өзгерту':'Жаңа пән'}</h3><form data-form="course" class="form-grid">${formField('Пән атауы','name','text',ec.name,'required maxlength="120"')+formField('Коды','code','text',ec.code,'required maxlength="30"')+formField('Кредит','credits','number',ec.credits||5,'required min="1" max="30"')+formField('Бағыты','category','text',ec.category||'Басқа пәндер','required')+formField('Топ (бос болса — барлық топ)','group_name','text',ec.group_name,'maxlength="60"')}<div><label for="teacher_id">Оқытушы</label><select id="teacher_id" name="teacher_id"><option value="">Тағайындалмаған</option>${data('profiles').filter(p=>p.role==='teacher'&&p.status==='active').map(p=>option(p.id,p.name,ec.teacher_id)).join('')}</select></div><div class="wide"><label for="description">Сипаттама</label><textarea id="description" name="description" maxlength="2000">${escape(ec.description)}</textarea></div><div class="inline-actions"><button class="primary">Сақтау</button><button type="button" class="ghost" data-action="cancel-course">Болдырмау</button></div></form></section>`:'')+`<div class="course-grid">${filtered.map(c=>`<article class="course"><div class="course-card-top"><span class="course-icon">🎓</span><span class="tag">${escape(c.credits)} кредит</span></div><h3>${escape(c.name)}</h3><p class="course-description">${escape(c.description)}</p><div class="course-meta"><span>${escape(c.code)} · ${escape(c.category)}</span><span>👤 ${escape(teacherName(c))}</span><span>👥 ${escape(c.group_name||'Барлық топ')}</span></div>${isAdmin()?`<button class="ghost" data-action="edit-course" data-id="${c.id}">Өзгерту</button>`:state.profile.role==='student'?`<button class="${enrolled(c.id)?'ghost':'primary'}" data-action="enroll" data-id="${c.id}">${enrolled(c.id)?'Тіркелуден шығу':'Пәнге тіркелу'}</button>`:''}</article>`).join('')||empty('Іздеуге сәйкес пән жоқ.')}</div>`;
}
function gpaPanel(){const g=calculateGpa(data('courses'),data('grades'),state.user.id);return `<div class="stats">${stat('Ағымдағы GPA / 4.00',g.display,'🎓')+stat('Бағаланған пәндер',g.rows.length,'📚')+stat('Кредиттер',g.credits,'📊')}</div><div class="card"><h3>GPA есебі</h3><p class="note">Ағымдағы бағалар бойынша есеп. Әр пәннің орташа балы 4 балдық шкалаға ауыстырылып, кредитке көбейтіледі; қосынды кредиттердің жалпы санына бөлінеді. Бағасыз пәндер есептелмейді. Бұл ресми транскрипт GPA-сы емес.</p><table><thead><tr><th>Пән</th><th>Кредит</th><th>Орташа балл</th><th>Әріптік баға</th><th>GPA балы</th></tr></thead><tbody>${g.rows.map(r=>`<tr><td>${escape(r.course.name)}</td><td>${r.credits}</td><td>${r.score.toFixed(2)}</td><td>${r.letter}</td><td>${r.points.toFixed(2)}</td></tr>`).join('')||'<tr><td colspan="5">Бағалар әлі енгізілмеген.</td></tr>'}</tbody></table><details><summary>Бағалау шкаласы</summary><p>${scale.map((r,i)=>`${r[0]}–${i?scale[i-1][0]-1:100}: ${r[1]} (${r[2].toFixed(2)})`).join(' · ')}</p><p>Шекара дөңгелектеусіз қолданылады: 89.9 — B+.</p></details></div>`;}
function studentOptions(cid){return data('enrollments').filter(e=>e.course_id===cid).map(e=>person(e.student_id)).filter(p=>p?.role==='student'&&p.status==='active').map(p=>option(p.id,`${p.name} · ${p.group_name||'Топ белгіленбеген'}`)).join('');}
function grades(){const tc=teaching();return title(isStaff()?'Бағалар және баға қою':'Менің бағаларым және GPA',isStaff()?'Тек өз пәніңізге тіркелген студенттерге баға қойылады':'Нәтижелер серверден жүктеледі')+(isStaff()?`<div class="card"><form data-form="grade" class="form-grid"><div><label for="grade-search">Пәнді іздеу</label><input id="grade-search" type="search" placeholder="Атауы немесе коды"><label for="grade-course">Пән</label><select name="course_id" id="grade-course" required>${courseOptions(tc)}</select></div><div><label for="grade-student">Студент</label><select name="student_id" id="grade-student" required>${studentOptions(tc[0]?.id)||'<option value="">Тіркелген студент жоқ</option>'}</select></div>${formField('Жұмыс атауы','assessment','text','','required maxlength="120" placeholder="Мысалы: Аралық бақылау 1"')+formField('Апта (0 — жалпы баға)','week','number',0,'required min="0" max="52"')+formField('Баға (0–100)','score','number','','required min="0" max="100" step="0.01"')}<div class="form-bottom"><button class="primary" ${!tc.length?'disabled':''}>Бағаны сақтау</button></div></form><p class="auth-help">Бір студенттің бір пәндегі жұмыс атауы мен аптасы қайталанса, бұрынғы баға жаңартылады. Жаңа жұмыс үшін басқа атау енгізіңіз.</p>${!tc.length?empty('Әкімші сізге пән тағайындағаннан кейін баға қоя аласыз.'):''}</div>`:gpaPanel())+`<div class="card"><h3>Бағалар тізімі</h3><table><thead><tr>${isStaff()?'<th>Студент</th>':''}<th>Пән</th><th>Жұмыс</th><th>Апта</th><th>Баға</th></tr></thead><tbody>${data('grades').map(g=>`<tr>${isStaff()?`<td>${escape(person(g.student_id)?.name)}</td>`:''}<td>${escape(course(g.course_id)?.name)}</td><td>${escape(g.assessment)}</td><td>${g.week||'—'}</td><td><strong>${Number(g.score).toFixed(2)}</strong> <span class="tag">${gradePoint(g.score)?.letter||'—'}</span></td></tr>`).join('')||'<tr><td colspan="5">Бағалар жоқ.</td></tr>'}</tbody></table></div>`;}
function schedule(){return title('Сабақ кестесі')+(isStaff()?`<div class="card"><form data-form="schedule" class="form-grid"><div><label for="schedule-course">Пән</label><select id="schedule-course" name="course_id" required>${courseOptions()}</select></div><div><label for="schedule-day">Күн</label><select id="schedule-day" name="day">${days.slice(1).map((d,i)=>option(String(i+1),d)).join('')}</select></div>${formField('Уақыт','start_time','time','','required')+formField('Аудитория','room','text','','required maxlength="60"')}<button class="primary">Кестеге қосу</button></form></div>`:'')+`<div class="card"><table><thead><tr><th>Күн</th><th>Уақыт</th><th>Пән</th><th>Топ</th><th>Аудитория</th>${isStaff()?'<th>Әрекет</th>':''}</tr></thead><tbody>${[...data('schedules')].sort((a,b)=>a.day-b.day||a.start_time.localeCompare(b.start_time)).map(s=>`<tr><td>${days[s.day]}</td><td>${escape(s.start_time.slice(0,5))}</td><td>${escape(course(s.course_id)?.name)}</td><td>${escape(course(s.course_id)?.group_name||'—')}</td><td>${escape(s.room)}</td>${isStaff()?`<td><button class="ghost small danger" data-action="delete-schedule" data-id="${s.id}">Жою</button></td>`:''}</tr>`).join('')||'<tr><td colspan="6">Сабақ кестесі бос.</td></tr>'}</tbody></table></div>`;}
function fileButton(path,name){return path?`<button class="ghost small" data-action="download" data-path="${escape(path)}" data-name="${escape(name)}">⬇ ${escape(name)}</button>`:'';}
function assignments(){return title('Оқу жоспары және тапсырмалар')+(isStaff()?`<div class="course-editor-card"><h3>Тапсырма қосу</h3><form data-form="assignment" class="form-grid"><div><label for="assignment-course">Пән</label><select id="assignment-course" name="course_id" required>${courseOptions()}</select></div><div><label for="assignment-kind">Түрі</label><select id="assignment-kind" name="kind">${['Дәріс','Практика','БӨЖ','Тест','Емтихан'].map(k=>option(k,k)).join('')}</select></div>${formField('Апта','week','number',1,'required min="1" max="52"')+formField('Тапсыру күні','due_date','date')+formField('Тақырып / нұсқаулық','title','text','','required maxlength="500"')}<div><label for="assignment-file">Файл (10 МБ дейін)</label><input id="assignment-file" name="file" type="file" accept=".pdf,.txt,.png,.jpg,.jpeg,.zip,.docx,.pptx,.xlsx"></div><button class="primary">Жариялау</button></form></div>`:'')+`<div class="plan-week-list">${[...data('assignments')].sort((a,b)=>a.week-b.week).map(a=>{const subs=data('submissions').filter(s=>s.assignment_id===a.id);const mine=subs.find(s=>s.student_id===state.user.id);return `<section class="card"><div class="plan-section-head"><span class="tag">${a.week}-апта · ${escape(a.kind)}</span><span class="muted">${escape(a.due_date||'Мерзім белгіленбеген')}</span></div><h3>${escape(a.title)}</h3><p>${escape(course(a.course_id)?.name)}</p>${fileButton(a.file_path,a.file_name)}${!isStaff()?`<form data-form="submission" data-id="${a.id}" class="assignment-submit-form"><label for="submit-${a.id}">${mine?'Жұмысты жаңарту':'Жұмысты жіберу'} (10 МБ дейін)</label><input id="submit-${a.id}" type="file" name="file" required accept=".pdf,.txt,.png,.jpg,.jpeg,.zip,.docx,.pptx,.xlsx"><button type="submit">Жіберу</button></form>${mine?`<p class="assignment-submitted">Жіберілді: ${escape(new Date(mine.submitted_at).toLocaleString('kk-KZ'))}</p>${fileButton(mine.file_path,mine.file_name)}`:''}`:`<div class="assignment-review"><strong>Жіберілген жұмыстар: ${subs.length}</strong>${subs.map(s=>`<p>${escape(person(s.student_id)?.name)} · ${escape(new Date(s.submitted_at).toLocaleString('kk-KZ'))} ${fileButton(s.file_path,s.file_name)}</p>`).join('')}</div>`}</section>`}).join('')||empty('Тапсырмалар әзірге жоқ.')}</div>`;}
function notices(withTitle=true){return (withTitle?title('Хабарламалар'):'')+(isStaff()&&withTitle?'<div class="card"><form data-form="notice"><label for="notice-body">Хабарландыру</label><textarea id="notice-body" name="body" required maxlength="2000"></textarea><button class="primary spaced">Жариялау</button></form></div>':'')+`<div class="card"><h3>Соңғы хабарландырулар</h3>${[...data('notices')].sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(n=>`<article class="message"><strong>${escape(new Date(n.created_at).toLocaleDateString('kk-KZ'))}</strong><p class="preserve-lines">${escape(n.body)}</p></article>`).join('')||empty('Хабарландыру жоқ.')}</div>`;}
function users(){return title('Аккаунттарды басқару','Рөл мен топты тек оқу орны тексергеннен кейін бекітіңіз')+`<div class="card"><table><thead><tr><th>Аты-жөні / Email</th><th>Рөл, күй және топ</th></tr></thead><tbody>${data('profiles').map(p=>`<tr><td><strong>${escape(p.name)}</strong><br>${escape(p.email)}</td><td>${p.id===state.user.id?'Өз аккаунтыңыз':`<form data-form="access" data-id="${p.id}" class="access-form"><label class="sr-only" for="role-${p.id}">Рөл</label><select id="role-${p.id}" name="role">${Object.entries(roles).map(([v,t])=>option(v,t,p.role)).join('')}</select><label class="sr-only" for="status-${p.id}">Күй</label><select id="status-${p.id}" name="status">${Object.entries(statuses).map(([v,t])=>option(v,t,p.status)).join('')}</select><label class="sr-only" for="group-${p.id}">Топ</label><input id="group-${p.id}" name="group_name" maxlength="60" placeholder="Топ" value="${escape(p.group_name)}"><button class="primary small">Сақтау</button></form>`}</td></tr>`).join('')}</tbody></table></div>`;}
function profile(){return title('Профиль және кіру')+`<div class="grid2"><div class="card"><h3>Жеке ақпарат</h3><form data-form="profile">${formField('Аты-жөні','name','text',state.profile.name,'required minlength="2" maxlength="100"')}<label>Email</label><p>${escape(state.profile.email)}</p><p>${roles[state.profile.role]} · ${escape(state.profile.group_name||'Топ белгіленбеген')}</p><button class="primary spaced">Сақтау</button></form><hr><button class="ghost" data-action="reset-password">Құпиясөзді өзгерту сілтемесін жіберу</button></div><div class="card"><h3>Face ID / Touch ID</h3><p>Алдымен аккаунтқа кіріп, осы құрылғыда passkey қосыңыз. Кейін сол кілт арқылы кіруге болады.</p>${supportedPasskeys()?'<button class="primary" data-action="register-passkey">＋ Passkey қосу</button><button class="ghost spaced" data-action="list-passkeys">Кілттерімді көрсету</button>':'<p class="note">Passkey бұл сайтта немесе құрылғыда әзірге қосылмаған. Email және құпиясөз арқылы кіру қолжетімді.</p>'}<div>${state.passkeys.map(p=>`<div class="message"><strong>${escape(p.friendly_name||'Passkey')}</strong><p>${escape(new Date(p.created_at).toLocaleDateString('kk-KZ'))}</p><button class="ghost small danger" data-action="delete-passkey" data-id="${escape(p.id)}">Кілтті жою</button></div>`).join('')}</div><p class="auth-help">Бет бейнесі сайтқа жіберілмейді. Құрылғыңыз Face ID, Touch ID немесе PIN-код ұсынуы мүмкін.</p></div></div>`;}
function audit(){return title('Өзгерістер журналы','Соңғы 200 өзгеріс')+`<div class="card"><table><thead><tr><th>Уақыт</th><th>Орындаушы</th><th>Бөлім</th><th>Әрекет</th><th>Өзгеріс</th></tr></thead><tbody>${data('audit_log').map(a=>`<tr><td>${escape(new Date(a.happened_at).toLocaleString('kk-KZ'))}</td><td>${escape(person(a.actor_id)?.name||'Жүйе')}</td><td>${escape(a.table_name)}</td><td>${escape(a.action)}</td><td><details><summary>Көру</summary><pre>${escape(JSON.stringify({before:a.before_data,after:a.after_data},null,2))}</pre></details></td></tr>`).join('')}</tbody></table></div>`;}

async function load(){
 const token=++generation;
 const {data:userData,error}=await client.auth.getUser();
 if(token!==generation)return;
 if(error||!userData?.user){state.user=null;state.profile=null;state.data={};render();return;}
 const user=userData.user;
 if(state.user?.id!==user.id){state.user=user;state.profile=null;state.data={};state.passkeys=[];}
 const profile=checked(await client.from('profiles').select('*').eq('id',user.id).single());
 let nextData={};
 if(profile.status==='active'){
  const tables=['profiles','courses','enrollments','grades','schedules','assignments','submissions','notices'];
  const results=await Promise.all(tables.map(allRows));
  nextData=Object.fromEntries(tables.map((t,i)=>[t,results[i]]));
  if(profile.role==='admin')nextData.audit_log=checked(await client.from('audit_log').select('*').order('id',{ascending:false}).limit(200));
 }
 if(token!==generation)return;
 state.user=user;state.profile=profile;state.data=nextData;render();
}
async function refreshAfterWrite(text){try{await load();message(text);}catch(err){message('Өзгеріс серверде сақталды, бірақ тізім жаңармады. «Жаңарту» батырмасын басыңыз.',true);}}
async function run(action,button){if(state.busy)return;state.busy=true;if(button)button.disabled=true;try{await action();}catch(err){if(state.user&&!state.profile)render();message(errorText(err),true);const feedback=document.querySelector('#auth-feedback');if(feedback)feedback.textContent=errorText(err);}finally{state.busy=false;if(button?.isConnected)button.disabled=false;}}
async function upload(file,prefix){
 if(!file||file.size===0)throw new Error('Empty file');
 if(file.size>10*1024*1024){throw {code:'file_too_large'};}
 const types={pdf:'application/pdf',txt:'text/plain',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',zip:'application/zip',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
 const ext=file.name.split('.').pop().toLowerCase();if(!types[ext])throw {code:'unsupported_file_type'};
 const path=`${prefix}/${crypto.randomUUID()}.${ext}`;
 checked(await client.storage.from('sis-files').upload(path,file,{contentType:types[ext],upsert:false}));
 return {file_path:path,file_name:file.name.slice(0,250)};
}
async function handleForm(form){
 const f=formValues(form),kind=form.dataset.form;
 const redirect=new URL('.',window.location.href).href;
 if(kind==='login'){checked(await client.auth.signInWithPassword({email:f.email.trim(),password:f.password}));state.mode='login';await load();return;}
 if(kind==='register'){
  checked(await client.auth.signUp({email:f.email.trim(),password:f.password,options:{data:{name:f.name.trim()},emailRedirectTo:redirect}}));
  state.mode='login';render();message('Email-ге келген растау сілтемесін ашыңыз. Одан кейін әкімшінің бекітуін күтіңіз.');return;
 }
 if(kind==='reset'){checked(await client.auth.resetPasswordForEmail(f.email.trim(),{redirectTo:redirect}));message('Аккаунт бар болса, қалпына келтіру сілтемесі email-ге жіберіледі. Сілтемені осы браузерде ашыңыз.');return;}
 if(kind==='newpassword'){checked(await client.auth.updateUser({password:f.password}));state.recovery=false;checked(await client.auth.signOut({scope:'global'}));state.user=null;state.profile=null;state.data={};state.mode='login';render();message('Құпиясөз жаңартылды. Қайта кіріңіз.');return;}
 if(kind==='profile'){await updateVersioned('profiles',state.profile,{name:f.name.trim()});await refreshAfterWrite('Профиль сақталды.');return;}
 if(kind==='access'){const p=person(form.dataset.id);checked(await client.rpc('set_account_access',{target:p.id,new_role:f.role,new_status:f.status,new_group:f.group_name.trim(),expected_version:p.version}));await refreshAfterWrite('Рөл және қолжетімділік жаңартылды.');return;}
 if(kind==='course'){
  const payload={name:f.name.trim(),code:f.code.trim().toUpperCase(),credits:Number(f.credits),category:f.category.trim(),group_name:f.group_name.trim(),teacher_id:f.teacher_id||null,description:f.description.trim()};
  if(state.editingCourse)await updateVersioned('courses',course(state.editingCourse),payload);else checked(await client.from('courses').insert(payload));
  state.courseEditor=false;state.editingCourse=null;await refreshAfterWrite('Пән сақталды.');return;
 }
 if(kind==='grade'){
  const payload={course_id:f.course_id,student_id:f.student_id,assessment:f.assessment.trim(),week:Number(f.week),score:Number(f.score)};
  const prior=data('grades').find(g=>g.course_id===payload.course_id&&g.student_id===payload.student_id&&g.assessment===payload.assessment&&g.week===payload.week);
  if(prior)await updateVersioned('grades',prior,payload);else checked(await client.from('grades').insert(payload));
  await refreshAfterWrite('Баға серверде сақталды.');return;
 }
 if(kind==='schedule'){checked(await client.from('schedules').insert({course_id:f.course_id,day:Number(f.day),start_time:f.start_time,room:f.room.trim()}));await refreshAfterWrite('Сабақ кестесі сақталды.');return;}
 if(kind==='assignment'){
  const file=form.elements.file.files[0];const attachment=file?await upload(file,`courses/${f.course_id}/${state.user.id}`):{};
  checked(await client.from('assignments').insert({course_id:f.course_id,title:f.title.trim(),kind:f.kind,week:Number(f.week),due_date:f.due_date||null,...attachment}));
  await refreshAfterWrite('Тапсырма жарияланды.');return;
 }
 if(kind==='submission'){
  const aid=form.dataset.id;const prior=data('submissions').find(s=>s.assignment_id===aid&&s.student_id===state.user.id);
  const attachment=await upload(form.elements.file.files[0],`submissions/${aid}/${state.user.id}`);
  if(prior)await updateVersioned('submissions',prior,attachment);else checked(await client.from('submissions').insert({assignment_id:aid,student_id:state.user.id,...attachment}));
  await refreshAfterWrite('Жұмысыңыз серверге жіберілді.');return;
 }
 if(kind==='notice'){checked(await client.from('notices').insert({body:f.body.trim(),author_id:state.user.id}));await refreshAfterWrite('Хабарландыру жарияланды.');}
}
root.addEventListener('submit',e=>{const form=e.target.closest('[data-form]');if(!form)return;e.preventDefault();void run(()=>handleForm(form),form.querySelector('button[type="submit"],button:not([type])'));});
root.addEventListener('input',e=>{
 if(e.target.id==='catalog-search'){const pos=e.target.selectionStart;state.query=e.target.value;document.querySelector('#content').innerHTML=courses();const input=document.querySelector('#catalog-search');input.focus();input.setSelectionRange(pos,pos);}
 if(e.target.id==='grade-search'){const q=e.target.value.toLowerCase();const select=document.querySelector('#grade-course');select.innerHTML=courseOptions(teaching().filter(c=>(c.name+' '+c.code).toLowerCase().includes(q)));document.querySelector('#grade-student').innerHTML=studentOptions(select.value)||'<option value="">Тіркелген студент жоқ</option>';}
});
root.addEventListener('change',e=>{if(e.target.id==='grade-course')document.querySelector('#grade-student').innerHTML=studentOptions(e.target.value)||'<option value="">Тіркелген студент жоқ</option>';});
root.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.mode){state.mode=b.dataset.mode;render();return;}
 if(b.dataset.page){state.page=b.dataset.page;state.query='';render();return;}
 const action=b.dataset.action;if(!action)return;
 void run(async()=>{
  const id=b.dataset.id;
  if(action==='menu'){document.querySelector('#sidebar').classList.toggle('open');return;}
  if(action==='refresh'){await load();message('Деректер жаңартылды.');return;}
  if(action==='logout'){checked(await client.auth.signOut({scope:'local'}));++generation;state.user=null;state.profile=null;state.data={};state.passkeys=[];render();return;}
  if(action==='passkey-login'){checked(await client.auth.signInWithPasskey());await load();return;}
  if(action==='register-passkey'){checked(await client.auth.registerPasskey());message('Passkey қосылды.');return;}
  if(action==='list-passkeys'){state.passkeys=checked(await client.auth.passkey.list())||[];render();return;}
  if(action==='delete-passkey'){if(!confirm('Осы passkey-ді жою керек пе? Email және құпиясөз арқылы кіру сақталады.'))return;checked(await client.auth.passkey.delete({passkeyId:id}));state.passkeys=checked(await client.auth.passkey.list())||[];render();message('Passkey жойылды.');return;}
  if(action==='reset-password'){checked(await client.auth.resetPasswordForEmail(state.user.email,{redirectTo:new URL('.',location.href).href}));message('Құпиясөзді өзгерту сілтемесі email-ге жіберілді. Осы браузерде ашыңыз.');return;}
  if(action==='add-course'){state.editingCourse=null;state.courseEditor=true;render();return;}
  if(action==='edit-course'){state.editingCourse=id;state.courseEditor=true;render();return;}
  if(action==='cancel-course'){state.editingCourse=null;state.courseEditor=false;render();return;}
  if(action==='enroll'){
   if(enrolled(id)){if(!confirm('Пәнге тіркелуден шығасыз ба? Баға қойылған пәннен шығу мүмкін емес.'))return;checked(await client.from('enrollments').delete().eq('course_id',id).eq('student_id',state.user.id).select().single());}
   else checked(await client.from('enrollments').insert({course_id:id,student_id:state.user.id}));
   await refreshAfterWrite('Пәнге тіркелу күйі жаңартылды.');return;
  }
  if(action==='delete-schedule'){if(!confirm('Сабақты кестеден жою керек пе?'))return;const row=data('schedules').find(s=>s.id===id);checked(await client.from('schedules').delete().eq('id',id).eq('version',row.version).select().single());await refreshAfterWrite('Кесте жазбасы жойылды.');return;}
  if(action==='download'){
   const blob=checked(await client.storage.from('sis-files').download(b.dataset.path));const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=b.dataset.name||'file';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
  }
 },b);
});
render();
if(client){
 client.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){state.recovery=true;state.user=session?.user;render();return;}
  if(event==='SIGNED_OUT'){++generation;state.user=null;state.profile=null;state.data={};state.passkeys=[];render();}
  if(event==='SIGNED_IN'&&!state.busy&&!state.recovery){setTimeout(()=>void run(load),0);}
 });
 void run(load);
}
