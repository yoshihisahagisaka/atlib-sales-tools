const D=require('../diagnosis.js'),I=require('./fixtures/inputs.json');
const copy=x=>JSON.parse(JSON.stringify(x));
function replace(input,id,value){input.answers=input.answers.filter(a=>a.questionId!==id);input.answers.push(D.answer(id,value));return input;}
function ready(){const x=copy(I.F06);for(const a of x.answers)if(!['C01','C02'].includes(a.questionId))Object.assign(a,D.answer(a.questionId,'READY'));return x;}
const cases=Object.entries(I).map(([id,input])=>({id,input:copy(input)}));
const push=(id,input,themes)=>cases.push({id,input,themes});
push('ALL_READY',ready(),[]);
const unknown=copy(I.F04);unknown.answers=unknown.answers.filter(a=>!a.questionId.startsWith('B')).map(a=>D.answer(a.questionId,'UNKNOWN'));push('ALL_UNKNOWN',unknown,[]);
push('AUTHORITY',replace(ready(),'C05','NOT_IN_POSITION_TO_ANSWER'),[]);
push('NOT_APPLICABLE',copy(I.F07),[]);
push('MULTI_BUSINESS',copy(I.F06),['T01','T02','T03']);
const compound=replace(replace(ready(),'C04','PARTIAL'),'B03','NOT_DONE');push('T02_COMPOUND',compound,['T02']);
push('T02_EXTERNAL_ONLY',replace(ready(),'C04','NOT_DONE'),['T02']);
push('T02_NOTICE_ONLY',replace(ready(),'B03','PARTIAL'),['T02']);
for(const [state,themes] of [['NOT_DONE',['T06']],['PARTIAL',['T06']],['READY',[]],['UNKNOWN',[]]])push('T06_'+state,replace(ready(),'C07',state),themes);
push('ZERO_THEMES',copy(I.F05),[]);
push('OVER_THREE',copy(I.F06),['T01','T02','T03']);
// Ensure T04/T05/T07/T08 are exercised beyond the normal top-three overflow.
for(const [id,q] of [['T01','B01'],['T03','C03'],['T04','C05'],['T05','C06'],['T07','B02'],['T08','B04']])for(const value of ['PARTIAL','NOT_DONE'])push(id+'_'+value,replace(ready(),q,value),[id]);
module.exports=cases;
