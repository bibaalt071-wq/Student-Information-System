export const scale = [[95,'A',4],[90,'A−',3.67],[85,'B+',3.33],[80,'B',3],[75,'B−',2.67],[70,'C+',2.33],[65,'C',2],[60,'C−',1.67],[55,'D+',1.33],[50,'D',1],[25,'FX',0],[0,'F',0]];
export function gradePoint(value) {
  const score = Number(value);
  if (value === null || value === '' || !Number.isFinite(score) || score<0 || score>100) return null;
  const [,letter,points] = scale.find(([min])=>score>=min);
  return {letter,points};
}
export function calculateGpa(courses, grades, studentId) {
  const rows = courses.flatMap(course=>{
    const marks = grades.filter(g=>g.student_id===studentId && g.course_id===course.id && gradePoint(g.score));
    if (!marks.length) return [];
    const score=marks.reduce((sum,g)=>sum+Number(g.score),0)/marks.length;
    return [{course,score,credits:Number(course.credits),...gradePoint(score)}];
  });
  const credits=rows.reduce((sum,r)=>sum+r.credits,0);
  const value=credits ? rows.reduce((sum,r)=>sum+r.points*r.credits,0)/credits : null;
  return {rows,credits,value,display:value===null?'—':value.toFixed(2)};
}
