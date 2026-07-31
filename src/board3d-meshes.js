export function buildMeshes(gl){
  const base=[[.34,0],[.36,.045],[.33,.09],[.27,.135],[.23,.18],[.2,.235],[.18,.29]];
  const profiles={
    Pawn:[...base,[.155,.36],[.11,.49],[.145,.555],[.105,.605],[0,.62]],
    Rook:[...base,[.18,.36],[.165,.55],[.205,.61],[.23,.68],[0,.695]],
    Bishop:[...base,[.155,.38],[.115,.56],[.17,.64],[.12,.72],[.075,.80],[0,.84]],
    Queen:[...base,[.165,.39],[.125,.57],[.19,.645],[.155,.71],[.205,.765],[.12,.825],[0,.845]],
    King:[...base,[.17,.4],[.13,.59],[.195,.66],[.145,.735],[.09,.79],[0,.81]],
  };
  const result={};
  for(const [name,profile] of Object.entries(profiles))result[name]=[lathe(gl,profile,32)];

  result.Pawn.push(sphere(gl,.142,20,12,{y:.735}));
  result.Bishop.push(sphere(gl,.105,18,10,{y:.91}),box(gl,.035,.19,.13,{x:.028,y:.91,z:0}));
  result.Queen.push(
    sphere(gl,.078,18,10,{y:.925}),
    ...crownOrbs(gl,.13,.875,.034)
  );

  result.Rook.push(
    box(gl,.46,.11,.46,{y:.745}),
    box(gl,.13,.12,.13,{x:.165,y:.86,z:.165}),
    box(gl,.13,.12,.13,{x:-.165,y:.86,z:.165}),
    box(gl,.13,.12,.13,{x:.165,y:.86,z:-.165}),
    box(gl,.13,.12,.13,{x:-.165,y:.86,z:-.165})
  );

  result.King.push(
    sphere(gl,.07,16,9,{y:.875}),
    box(gl,.075,.24,.075,{y:.995}),
    box(gl,.24,.07,.075,{y:1.03})
  );

  result.Knight=[
    lathe(gl,base,32),
    extrude(gl,[
      [-.24,.29],[.18,.29],[.205,.36],[.13,.42],[.11,.49],
      [.205,.585],[.17,.69],[.08,.82],[-.02,.89],[-.105,.86],
      [-.16,.77],[-.12,.68],[-.205,.59],[-.17,.49],[-.255,.41]
    ],.24),
    box(gl,.045,.12,.045,{x:.035,y:.91,z:.055}),
    box(gl,.045,.12,.045,{x:-.03,y:.9,z:-.055})
  ];
  return result;
}

function crownOrbs(gl,radius,y,size){
  const parts=[];
  for(let k=0;k<6;k++){
    const a=k/6*Math.PI*2;
    parts.push(sphere(gl,size,12,7,{x:Math.cos(a)*radius,y:y+(k%2)*.012,z:Math.sin(a)*radius}));
  }
  return parts;
}

function upload(gl,p,n,i,transform=identity()){
  const vao=gl.createVertexArray(),pb=gl.createBuffer(),nb=gl.createBuffer(),ib=gl.createBuffer();
  if(!vao||!pb||!nb||!ib)throw new Error("WebGL mesh allocation failed");
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(p),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,nb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(n),gl.STATIC_DRAW);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(i),gl.STATIC_DRAW);gl.bindVertexArray(null);
  return{vao,count:i.length,transform};
}

function lathe(gl,profile,segments=32){
  const p=[],n=[],i=[],stride=segments+1;
  for(let r=0;r<profile.length;r++){
    const [radius,y]=profile[r],prev=profile[Math.max(0,r-1)],next=profile[Math.min(profile.length-1,r+1)],dr=next[0]-prev[0],dy=next[1]-prev[1],len=Math.hypot(dy,dr)||1,nr=dy/len,ny=-dr/len;
    for(let s=0;s<=segments;s++){const a=s/segments*Math.PI*2,c=Math.cos(a),q=Math.sin(a);p.push(radius*c,y,radius*q);n.push(nr*c,ny,nr*q)}
  }
  for(let r=0;r<profile.length-1;r++)for(let s=0;s<segments;s++){const a=r*stride+s,b=a+stride;i.push(a,b,a+1,b,b+1,a+1)}
  return upload(gl,p,n,i);
}

function sphere(gl,r,lon,lat,t={}){
  const p=[],n=[],i=[],stride=lon+1;
  for(let y=0;y<=lat;y++){const phi=y/lat*Math.PI,sp=Math.sin(phi),cp=Math.cos(phi);for(let x=0;x<=lon;x++){const th=x/lon*Math.PI*2,c=Math.cos(th)*sp,q=Math.sin(th)*sp;p.push(c*r,cp*r,q*r);n.push(c,cp,q)}}
  for(let y=0;y<lat;y++)for(let x=0;x<lon;x++){const a=y*stride+x,b=a+stride;i.push(a,b,a+1,b,b+1,a+1)}
  return upload(gl,p,n,i,translate(t.x||0,t.y||0,t.z||0));
}

function box(gl,w,h,d,t={}){
  const x=w/2,y=h/2,z=d/2,p=[-x,-y,z,x,-y,z,x,y,z,-x,y,z,x,-y,-z,-x,-y,-z,-x,y,-z,x,y,-z,-x,y,z,x,y,z,x,y,-z,-x,y,-z,-x,-y,-z,x,-y,-z,x,-y,z,-x,-y,z,x,-y,z,x,-y,-z,x,y,-z,x,y,z,-x,-y,-z,-x,-y,z,-x,y,z,-x,y,-z],n=[0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0],i=[];
  for(let f=0;f<6;f++){const o=f*4;i.push(o,o+1,o+2,o,o+2,o+3)}return upload(gl,p,n,i,translate(t.x||0,t.y||0,t.z||0));
}

function extrude(gl,pts,depth){
  const p=[],n=[],i=[],z=depth/2,L=pts.length;
  for(const side of [z,-z])for(const [x,y] of pts){p.push(x,y,side);n.push(0,0,side>0?1:-1)}
  for(let k=1;k<L-1;k++){i.push(0,k,k+1,L,L+k+1,L+k)}
  for(let k=0;k<L;k++){const j=(k+1)%L,[x1,y1]=pts[k],[x2,y2]=pts[j],dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1,nx=dy/len,ny=-dx/len,o=p.length/3;p.push(x1,y1,z,x2,y2,z,x2,y2,-z,x1,y1,-z);for(let q=0;q<4;q++)n.push(nx,ny,0);i.push(o,o+1,o+2,o,o+2,o+3)}
  return upload(gl,p,n,i);
}

export function identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}
export function translate(x,y,z){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1])}
export function scale(x,y,z){return new Float32Array([x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1])}
export function multiply(a,b){const r=new Float32Array(16);for(let c=0;c<4;c++)for(let y=0;y<4;y++){let v=0;for(let k=0;k<4;k++)v+=a[k*4+y]*b[c*4+k];r[c*4+y]=v}return r}
export function ortho(l,r,b,t,n,f){const lr=1/(l-r),bt=1/(b-t),nf=1/(n-f);return new Float32Array([-2*lr,0,0,0,0,-2*bt,0,0,0,0,2*nf,0,(l+r)*lr,(t+b)*bt,(f+n)*nf,1])}
export function normal3(m){const x=Math.hypot(m[0],m[1],m[2])||1,y=Math.hypot(m[4],m[5],m[6])||1,z=Math.hypot(m[8],m[9],m[10])||1;return new Float32Array([m[0]/x/x,m[1]/x/x,m[2]/x/x,m[4]/y/y,m[5]/y/y,m[6]/y/y,m[8]/z/z,m[9]/z/z,m[10]/z/z])}
