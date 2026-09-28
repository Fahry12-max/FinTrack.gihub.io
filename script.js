const START_CASH=356000, START_INV=149000, TARGET=30000;
let tx=JSON.parse(localStorage.getItem('fintrack_tx')||'[]');

const rupiah=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
const today=()=>new Date().toISOString().slice(0,10);
document.getElementById('date').value=today();

function save(){localStorage.setItem('fintrack_tx',JSON.stringify(tx));render();}
function addTransaction(){
  const amount=Number(document.getElementById('amount').value);
  const category=document.getElementById('category').value.trim()||'Lainnya';
  const type=document.getElementById('type').value;
  if(!amount||amount<=0){alert('Masukkan nominal yang valid.');return}
  tx.unshift({id:Date.now(),date:document.getElementById('date').value||today(),type,amount,category,note:document.getElementById('noteInput').value.trim()});
  document.getElementById('amount').value='';document.getElementById('category').value='';document.getElementById('noteInput').value='';
  save();
}
function del(id){tx=tx.filter(x=>x.id!==id);save()}
function resetData(){if(confirm('Hapus semua transaksi yang tersimpan di browser ini?')){tx=[];save()}}
function currentWeekStart(){
  const d=new Date(); const day=d.getDay(); const diff=(day+6)%7;
  d.setDate(d.getDate()-diff);d.setHours(0,0,0,0);return d;
}
function render(){
  let cash=START_CASH, inv=START_INV;
  tx.forEach(x=>{
    if(x.type==='income')cash+=x.amount;
    if(x.type==='expense')cash-=x.amount;
    if(x.type==='investment'){cash-=x.amount;inv+=x.amount;}
  });
  document.getElementById('cash').textContent=rupiah(cash);
  document.getElementById('investment').textContent=rupiah(inv);
  document.getElementById('totalAsset').textContent=rupiah(cash+inv);

  const ws=currentWeekStart();
  const weekInv=tx.filter(x=>x.type==='investment'&&new Date(x.date+'T00:00:00')>=ws).reduce((s,x)=>s+x.amount,0);
  document.getElementById('weeklyProgress').textContent=rupiah(weekInv)+' / '+rupiah(TARGET);
  document.getElementById('progressBar').style.width=Math.min(100,weekInv/TARGET*100)+'%';

  // streak = consecutive weeks with >= target, counting current week backward
  let streak=0;
  for(let i=0;i<104;i++){
    const start=new Date(ws);start.setDate(start.getDate()-7*i);
    const end=new Date(start);end.setDate(end.getDate()+7);
    const sum=tx.filter(x=>x.type==='investment'&&new Date(x.date+'T00:00:00')>=start&&new Date(x.date+'T00:00:00')<end).reduce((s,x)=>s+x.amount,0);
    if(sum>=TARGET)streak++;else break;
  }
  document.getElementById('streak').textContent=streak+' 🔥';

  const now=new Date(),m=now.getMonth(),y=now.getFullYear();
  const month=tx.filter(x=>{const d=new Date(x.date+'T00:00:00');return d.getMonth()===m&&d.getFullYear()===y});
  document.getElementById('monthIncome').textContent=rupiah(month.filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0));
  document.getElementById('monthExpense').textContent=rupiah(month.filter(x=>x.type==='expense').reduce((s,x)=>s+x.amount,0));
  document.getElementById('monthInvest').textContent=rupiah(month.filter(x=>x.type==='investment').reduce((s,x)=>s+x.amount,0));

  renderChart();renderTable();
}
function renderChart(){
  const el=document.getElementById('chart');el.innerHTML='';
  for(let i=6;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);const key=d.toISOString().slice(0,10);
    const val=tx.filter(x=>x.type==='investment'&&x.date===key).reduce((s,x)=>s+x.amount,0);
    const wrap=document.createElement('div');wrap.className='barwrap';
    const b=document.createElement('div');b.className='bar';b.style.height=(val?Math.max(8,Math.min(100,val/TARGET*100)):3)+'%';b.title=rupiah(val);
    const col=document.createElement('div');col.style.width='100%';col.style.textAlign='center';col.appendChild(b);
    const lab=document.createElement('div');lab.className='barlabel';lab.textContent=d.toLocaleDateString('id-ID',{weekday:'short'}).slice(0,3);
    col.appendChild(lab);wrap.appendChild(col);el.appendChild(wrap);
  }
}
function renderTable(){
  const el=document.getElementById('table');
  if(!tx.length){el.innerHTML='<div class="empty">Belum ada transaksi. Tambahkan transaksi pertamamu di atas.</div>';return}
  el.innerHTML='<table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Nominal</th><th></th></tr></thead><tbody>'+
    tx.slice(0,30).map(x=>`<tr><td>${x.date}</td><td>${x.type==='income'?'Pemasukan':x.type==='expense'?'Pengeluaran':'Investasi'}</td><td>${escapeHtml(x.category)}</td><td class="${x.type==='income'?'income':x.type==='expense'?'expense':'green'}">${x.type==='expense'?'-':''}${rupiah(x.amount)}</td><td><button class="danger" onclick="del(${x.id})">Hapus</button></td></tr>`).join('')+
    '</tbody></table>';
}
function escapeHtml(s){return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function exportCSV(){
  if(!tx.length){alert('Belum ada transaksi.');return}
  const rows=[['Tanggal','Jenis','Kategori','Nominal','Catatan'],...tx.map(x=>[x.date,x.type,x.category,x.amount,x.note||''])];
  const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='fintrack-transaksi.csv';a.click();
}
render();