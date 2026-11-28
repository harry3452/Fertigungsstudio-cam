/* Fertigungsstudio CAM – vollständige STL-Ansicht mit GPU-Z-Puffer.
 * Zeichnet ALLE Modell-Dreiecke; keine zufällige Ausdünnung und damit keine
 * fehlenden Flächen. Getrennte Farb-ID-Passage für präzise Bodenwahl.
 * Eigene Implementierung, ohne Fremdbibliothek. Keine Kollisionsprüfung.
 */
(function(root){
'use strict';
function createSoftware(canvas,surface){
 const c=surface.getContext('2d',{alpha:true});if(!c){surface.remove();return null;}
 const canvasPixels=()=>({w:Math.max(1,canvas.clientWidth),h:Math.max(1,canvas.clientHeight)});
 let flat=null,count=0,light=null,stock=null,buffer=null,ids=null,depths=null,renderWidth=0,renderHeight=0,renderKey='';
 function setMesh(triangles,bounds){
  count=Array.isArray(triangles)?triangles.length:0;stock=bounds;
  flat=new Float32Array(count*9);light=new Uint8Array(count);const scale=100/Math.max(bounds[0],bounds[1],bounds[2],1);
  for(let i=0;i<count;i++){
   const t=triangles[i],a=t[0],b=t[1],d=t[2];
   const nx=(b[1]-a[1])*(d[2]-a[2])-(b[2]-a[2])*(d[1]-a[1]);
   const ny=(b[2]-a[2])*(d[0]-a[0])-(b[0]-a[0])*(d[2]-a[2]);
   const nz=(b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]);
   const len=Math.max(1e-12,Math.hypot(nx,ny,nz));light[i]=Math.round(255*Math.max(.15,Math.min(1,.5+.3*nz/len+.12*nx/len-.08*ny/len)));
   for(let v=0;v<3;v++)for(let j=0;j<3;j++)flat[i*9+v*3+j]=(t[v][j]-bounds[j]/2)*scale;
  }
  renderKey='';buffer=null;ids=null;
 }
 function draw(yaw,pitch,zoom){
  if(!count){clear();return false;}
  const {w,h}=canvasPixels();
  // Draw all faces into a low-resolution Z-buffer, never discard triangles.
  // A lower output resolution during orbit is intentional but has no mesh holes.
  const dragging=typeof drag!=='undefined'&&drag!==null;
  const quality=dragging?.42:.78;
  const W=Math.max(160,Math.round(w*quality)),H=Math.max(130,Math.round(h*quality));
  const key=[yaw,pitch,zoom,W,H,count].join('/');if(key===renderKey)return true;
  renderKey=key;
  surface.width=W;surface.height=H;renderWidth=W;renderHeight=H;
  const image=c.createImageData(W,H),rgba=image.data,zbuf=new Float32Array(W*H),picks=new Int32Array(W*H);
  zbuf.fill(-Infinity);
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const f=Math.min(w/170,h/145)*zoom*quality;
  const X=new Float32Array(3),Y=new Float32Array(3),Z=new Float32Array(3);
  for(let i=0;i<count;i++){
   const base=i*9;
   for(let k=0;k<3;k++){
    const x=flat[base+k*3],y=flat[base+k*3+1],z=flat[base+k*3+2];
    const xx=x*cy-y*sy,yy=x*sy+y*cy;
    X[k]=W/2+xx*f;Y[k]=H*.56+(yy*cp-z*sp)*f;Z[k]=yy*sp+z*cp;
   }
   let x0=Math.max(0,Math.floor(Math.min(X[0],X[1],X[2]))),x1=Math.min(W-1,Math.ceil(Math.max(X[0],X[1],X[2])));
   let y0=Math.max(0,Math.floor(Math.min(Y[0],Y[1],Y[2]))),y1=Math.min(H-1,Math.ceil(Math.max(Y[0],Y[1],Y[2])));
   if(x0>x1||y0>y1)continue;
   const den=(X[1]-X[0])*(Y[2]-Y[0])-(Y[1]-Y[0])*(X[2]-X[0]);if(Math.abs(den)<1e-10)continue;
   const inv=1/den;
   const l=light[i]/255,rr=Math.round(94*(.69+l*.52)),gg=Math.round(130*(.69+l*.52)),bb=Math.round(151*(.69+l*.52));
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const px=x+.5-X[0],py=y+.5-Y[0];
    const u=(px*(Y[2]-Y[0])-py*(X[2]-X[0]))*inv;
    const v=(py*(X[1]-X[0])-px*(Y[1]-Y[0]))*inv;
    if(u<-.000001||v<-.000001||u+v>1.000001)continue;
    const k=y*W+x,depth=Z[0]+u*(Z[1]-Z[0])+v*(Z[2]-Z[0]);
    if(depth<=zbuf[k])continue;
    zbuf[k]=depth;picks[k]=i+1;
    const at=k*4;rgba[at]=rr;rgba[at+1]=gg;rgba[at+2]=bb;rgba[at+3]=255;
   }
  }
  c.putImageData(image,0,0);buffer=image;ids=picks;depths=zbuf;
  return true;
 }
 function pick(x,y,yaw,pitch,zoom){if(!count)return null;
  draw(yaw,pitch,zoom);
  const {w,h}=canvasPixels(),ix=Math.floor(x*renderWidth/w),iy=Math.floor(y*renderHeight/h);
  if(ix<0||iy<0||ix>=renderWidth||iy>=renderHeight)return null;
  const id=ids[iy*renderWidth+ix];if(!id)return null;
  return {index:id-1,x:(ix+.5)*w/renderWidth,y:(iy+.5)*h/renderHeight};
 }
 function clear(){c.clearRect(0,0,surface.width,surface.height);count=0;flat=null;renderKey='';ids=null;}
 return {setMesh,draw,pick,clear,stats:()=>({triangles:count,renderer:'software full-mesh z-buffer'})};
}
function create(canvas,view){
 if(!canvas||!view||!canvas.parentElement)return null;
 const surface=document.createElement('canvas');
 surface.id='studioSolidMesh';surface.setAttribute('aria-hidden','true');
 surface.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;';
 view.insertBefore(surface,canvas);
 canvas.style.position='relative';canvas.style.zIndex='1';canvas.style.background='transparent';
 const style=document.createElement('style');style.textContent='.view>.viewtitle,.view>.viewbuttons,.view>.legend,.view>.studio-model-pick-hint{z-index:3}';document.head.appendChild(style);
 const gl=surface.getContext('webgl',{alpha:true,depth:true,antialias:true,preserveDrawingBuffer:false})||surface.getContext('experimental-webgl',{alpha:true,depth:true,antialias:true});
 if(!gl)return createSoftware(canvas,surface);
 const vs='attribute vec3 aPos;attribute float aLight;attribute vec3 aId;uniform vec2 uSize;uniform float uScale;uniform float uYaw;uniform float uPitch;varying float vLight;varying vec3 vId;void main(){float cy=cos(uYaw),sy=sin(uYaw);float x=aPos.x*cy-aPos.y*sy;float y=aPos.x*sy+aPos.y*cy;float cp=cos(uPitch),sp=sin(uPitch);float sx=uSize.x*.5+x*uScale;float syy=uSize.y*.56+(y*cp-aPos.z*sp)*uScale;float depth=y*sp+aPos.z*cp;gl_Position=vec4(sx*2.0/uSize.x-1.0,1.0-syy*2.0/uSize.y,-depth/250.0,1.0);vLight=aLight;vId=aId;}';
 const fs='precision mediump float;varying float vLight;varying vec3 vId;uniform float uPick;void main(){if(uPick>.5){gl_FragColor=vec4(vId,1.0);}else{vec3 c=vec3(.37,.51,.59)*(0.69+vLight*.52);gl_FragColor=vec4(c,1.0);}}';
 function shader(type,src){const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error('WebGL-Shader: '+gl.getShaderInfoLog(sh));return sh;}
 let program;
 try{program=gl.createProgram();const vert=shader(gl.VERTEX_SHADER,vs),frag=shader(gl.FRAGMENT_SHADER,fs);gl.attachShader(program,vert);gl.attachShader(program,frag);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('WebGL-Link: '+gl.getProgramInfoLog(program));gl.deleteShader(vert);gl.deleteShader(frag);}catch(e){surface.remove();console.warn(e.message);return null;}
 const attrib={pos:gl.getAttribLocation(program,'aPos'),light:gl.getAttribLocation(program,'aLight'),id:gl.getAttribLocation(program,'aId')};
 const uniform={size:gl.getUniformLocation(program,'uSize'),scale:gl.getUniformLocation(program,'uScale'),yaw:gl.getUniformLocation(program,'uYaw'),pitch:gl.getUniformLocation(program,'uPitch'),pick:gl.getUniformLocation(program,'uPick')};
 let vbo=null,vertexCount=0,triCount=0,rawCount=0,width=0,height=0,pickFrame=null,pickTexture=null,pickDepth=null;
 function disposePick(){if(pickFrame){gl.deleteFramebuffer(pickFrame);gl.deleteTexture(pickTexture);gl.deleteRenderbuffer(pickDepth);pickFrame=pickTexture=pickDepth=null;}}
 function resize(){const ww=Math.max(1,canvas.clientWidth),hh=Math.max(1,canvas.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.round(ww*dpr),h=Math.round(hh*dpr);if(w!==width||h!==height){width=w;height=h;surface.width=w;surface.height=h;disposePick();}gl.viewport(0,0,width,height);return {ww,hh};}
 function setMesh(triangles,stock){
  if(vbo){gl.deleteBuffer(vbo);vbo=null;}vertexCount=0;triCount=0;
  if(!Array.isArray(triangles)||!Array.isArray(stock)||!triangles.length)return;
  if(triangles.length>300000)throw Error('Zu viele Dreiecke für die GPU-Vorschau.');
  const scale=100/Math.max(stock[0],stock[1],stock[2],1);
  const data=new Float32Array(triangles.length*3*7);
  let k=0;
  for(let i=0;i<triangles.length;i++){
   const t=triangles[i],a=t[0],b=t[1],c=t[2];
   const nx=(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]);
   const ny=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
   const nz=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
   const len=Math.max(1e-12,Math.hypot(nx,ny,nz));
   const light=Math.max(.15,Math.min(1,.5+.3*nz/len+.12*nx/len-.08*ny/len));
   const id=i+1,r=(id&255)/255,g=((id>>8)&255)/255,bl=((id>>16)&255)/255;
   for(const p of t){data[k++]=(p[0]-stock[0]/2)*scale;data[k++]=(p[1]-stock[1]/2)*scale;data[k++]=(p[2]-stock[2]/2)*scale;data[k++]=light;data[k++]=r;data[k++]=g;data[k++]=bl;}
  }
  vbo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
  triCount=triangles.length;vertexCount=triangles.length*3;rawCount=data.byteLength;
 }
 function prepare(yaw,pitch,zoom,mode){const {ww,hh}=resize();gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);const stride=28;
  gl.enableVertexAttribArray(attrib.pos);gl.vertexAttribPointer(attrib.pos,3,gl.FLOAT,false,stride,0);
  gl.enableVertexAttribArray(attrib.light);gl.vertexAttribPointer(attrib.light,1,gl.FLOAT,false,stride,12);
  gl.enableVertexAttribArray(attrib.id);gl.vertexAttribPointer(attrib.id,3,gl.FLOAT,false,stride,16);
  gl.uniform2f(uniform.size,ww,hh);gl.uniform1f(uniform.scale,Math.min(ww/170,hh/145)*zoom);gl.uniform1f(uniform.yaw,yaw);gl.uniform1f(uniform.pitch,pitch);gl.uniform1f(uniform.pick,mode);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.disable(gl.DITHER);
 }
 function draw(yaw,pitch,zoom){if(!vbo){gl.bindFramebuffer(gl.FRAMEBUFFER,null);resize();gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);return false;}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);prepare(yaw,pitch,zoom,0);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,vertexCount);return true;
 }
 function ensurePick(){if(pickFrame)return;pickFrame=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,pickFrame);pickTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,pickTexture);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,pickTexture,0);pickDepth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,pickDepth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,width,height);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,pickDepth);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('WebGL-Auswahlpuffer konnte nicht erstellt werden.');
 }
 function pick(x,y,yaw,pitch,zoom){if(!vbo||x<0||y<0||x>=canvas.clientWidth||y>=canvas.clientHeight)return null;
  prepare(yaw,pitch,zoom,1);ensurePick();gl.bindFramebuffer(gl.FRAMEBUFFER,pickFrame);gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,vertexCount);
  const rgba=new Uint8Array(4),sx=Math.min(width-1,Math.floor(x*width/canvas.clientWidth)),sy=Math.min(height-1,Math.floor((canvas.clientHeight-y)*height/canvas.clientHeight));gl.readPixels(sx,sy,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);const id=(rgba[0]|(rgba[1]<<8)|(rgba[2]<<16));return id>0&&id<=triCount?{index:id-1,x,y}:null;
 }
 function clear(){if(vbo)gl.deleteBuffer(vbo);vbo=null;vertexCount=triCount=0;gl.bindFramebuffer(gl.FRAMEBUFFER,null);resize();gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);disposePick();}
 surface.addEventListener('webglcontextlost',e=>{e.preventDefault();console.warn('WebGL-Kontext verloren.');});
 return {setMesh,draw,pick,clear,stats:()=>({triangles:triCount,bytes:rawCount,renderer:'WebGL full mesh'})};
}
root.FertigungsstudioSTLRenderer={create};if(typeof module==='object'&&module.exports)module.exports={create};
})(typeof globalThis==='object'?globalThis:this);
