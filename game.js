import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---- Alden Kael character sheet ----
const ALDEN={name:'Alden Kael',hp:48,maxHp:48,focus:20,ac:16,speed:30,str:14,dex:16,con:14,int:12,wis:13,cha:15,atk:5,potions:3};
const mod=s=>Math.floor((s-10)/2);
const MOVE=ALDEN.speed*0.3048/6*1.6;
const PAGES_NEEDED=5;
const JOURNAL=[
 "Page 1: 'The guard captain told me I was found at the keep gate as an infant, wrapped in a blue cloak.'",
 "Page 2: 'The Kael line held this keep. They bargained with something below the crypt.'",
 "Page 3: 'The scar on my cheek... I remember now. A wraith's claw. I was here before, as a child.'",
 "Page 4: 'My mother sealed the crypt with her life and sent me away so the bargain would end.'",
 "Page 5: 'The hollow ones wait for the last Kael. I must not let them leave these walls. Go north. Live.'"
];
const loadEl=document.getElementById('loading');

// ---- Persistent settings (localStorage 'hk_settings') ----
const SET_DEF={master:.8,music:.7,sfx:.9,ambient:.7,preset:'High',aa:'MSAA 4x',shadows:'Low',texq:'High',renderScale:1,vrScale:.9,foveation:1,refresh:72,fog:1,brightness:1,fov:75,
 physics:true,armSwing:true,armSens:1,turnMode:'Snap',snapAngle:30,turnSpeed:120,vignette:true,sprintMode:'Hold',leftHanded:false,subtitles:true,haptics:true,mouseSens:1,invertY:false};
const SET=Object.assign({},SET_DEF,JSON.parse(localStorage.getItem('hk_settings')||'{}'));
const saveSettings=()=>localStorage.setItem('hk_settings',JSON.stringify(SET));
// ---- Renderer ----
const renderer=new THREE.WebGLRenderer({antialias:SET.aa!=='Off',powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)*SET.renderScale);renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.xr.enabled=true;renderer.xr.setFoveation?.(SET.foveation);renderer.xr.setFramebufferScaleFactor?.(SET.vrScale);
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));
const scene=new THREE.Scene();scene.background=new THREE.Color(0x030409);scene.fog=new THREE.FogExp2(0x070910,0.085);
const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,0.03,60);
camera.layers.enable(0);
const rig=new THREE.Group();rig.add(camera);scene.add(rig);camera.position.y=1.7;
scene.add(new THREE.HemisphereLight(0x2a3858,0x0a0806,0.35));
const moon=new THREE.DirectionalLight(0x8899cc,0.35);moon.position.set(8,14,-4);scene.add(moon);

// ---- Textures (Poly Haven CC0, 1K) ----
const TL=new THREE.TextureLoader();const maxAniso=Math.min(4,renderer.capabilities.getMaxAnisotropy());
function pbr(name,rx=1,ry=1,extra={}){const m={};for(const [k,f] of [['map','diff'],['normalMap','nor'],['roughnessMap','rough']]){const t=TL.load(`assets/tex/${name}_${f}.jpg`);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rx,ry);t.anisotropy=maxAniso;if(k==='map')t.colorSpace=THREE.SRGBColorSpace;m[k]=t;}
 return new THREE.MeshStandardMaterial({...m,roughness:1,metalness:0,...extra});}
const wallMat=pbr('wall',1,1.3,{color:0x9a948c});
const floorMat=pbr('floor',1,1,{color:0x8a8580});
const blockMat=pbr('block',1,2,{color:0x8c8780});
const woodMat=pbr('wood',1,1,{color:0x8a6a50});
const metalMat=pbr('metal',1,1,{metalness:.85,color:0xaaaaaa});
const ceilMat=pbr('wood',8,8,{color:0x3a3028});

// ---- Level ----
const _preCastle=new Set(scene.children);
const MAP=[
"###########N###########",
"#.....#.........#.....#",
"#.P...#..#####..#..P..#",
"#.....+..#...#..+.....#",
"###+###..#.P.#..###+###",
"#........#...#........#",
"#..####..##+##..####..#",
"#..#..........G....#..#",
"#..#..####+####....#..#",
"#.....#.......#.......#",
"####..#...P...#..######",
"#.....#.......#..G....#",
"#.G...####+####.......#",
"#.....................#",
"#..P....#.....#...S...#",
"#######################"];
const T=2.5,W=MAP[0].length,H=MAP.length,WH=3.4;
let gateOpen=false,gate;
const cell=(i,j)=>(j<0||j>=H||i<0||i>=W)?'#':MAP[j][i];
let solid=(x,z)=>{const c=cell(Math.floor(x/T+0.5),Math.floor(z/T+0.5));return c==='#'||(c==='N'&&!gateOpen)||(c==='O');};
const isWall=(i,j)=>cell(i,j)==='#';
let wallCount=0;for(const r of MAP)for(const c of r)if(c==='#')wallCount++;
const wallIM=new THREE.InstancedMesh(new THREE.BoxGeometry(T,WH,T),wallMat,wallCount);wallIM.receiveShadow=true;let wi=0;const dm=new THREE.Matrix4();
const fRep=new THREE.PlaneGeometry(W*T,H*T);fRep.attributes.uv.array.forEach((v,i,a)=>a[i]=v*(i%2?H:W)*T/2.5);
const floor=new THREE.Mesh(fRep,floorMat);floor.rotation.x=-Math.PI/2;floor.position.set((W-1)*T/2,0,(H-1)*T/2);floor.receiveShadow=true;scene.add(floor);
const ceil=new THREE.Mesh(new THREE.PlaneGeometry(W*T,H*T),ceilMat);ceil.rotation.x=Math.PI/2;ceil.position.set((W-1)*T/2,WH,(H-1)*T/2);scene.add(ceil);
// ceiling beams
const beamG=new THREE.BoxGeometry(W*T,.25,.3);for(let j=1;j<H;j+=2){const b=new THREE.Mesh(beamG,woodMat);b.position.set((W-1)*T/2,WH-.15,j*T);scene.add(b);}
let start=new THREE.Vector3(),gatePos=new THREE.Vector3();const pages=[],ghoulSpawns=[],torchSpots=[];
// glow sprite texture
const gc=document.createElement('canvas');gc.width=gc.height=64;{const g=gc.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.3,'rgba(255,200,120,.5)');gr.addColorStop(1,'rgba(255,120,40,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);}
const glowTex=new THREE.CanvasTexture(gc);
const glow=(color,size)=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));s.scale.setScalar(size);return s;};
const flames=[];
function makeFlame(scale=1){const g=new THREE.Group();const core=glow(0xffc070,.25*scale),outer=glow(0xff6a20,.6*scale);g.add(outer,core);flames.push({core,outer,s:scale,ph:Math.random()*10});return g;}
// page parchment texture
const pc=document.createElement('canvas');pc.width=128;pc.height=160;{const g=pc.getContext('2d');g.fillStyle='#d9c99a';g.fillRect(0,0,128,160);for(let i=0;i<400;i++){g.fillStyle=`rgba(90,60,20,${Math.random()*.15})`;g.fillRect(Math.random()*128,Math.random()*160,3,3);}g.strokeStyle='rgba(40,25,10,.7)';for(let y=20;y<150;y+=10){g.beginPath();g.moveTo(12,y);g.lineTo(116-Math.random()*30,y);g.stroke();}}
const pageMat=new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(pc),emissive:0x3a2a10,side:THREE.DoubleSide,roughness:.9});pageMat.map.colorSpace=THREE.SRGBColorSpace;
// cobweb texture
const wc=document.createElement('canvas');wc.width=wc.height=128;{const g=wc.getContext('2d');g.strokeStyle='rgba(220,220,220,.5)';g.lineWidth=1;for(let a=0;a<8;a++){g.beginPath();g.moveTo(0,0);g.lineTo(Math.cos(a*Math.PI/16)*128,Math.sin(a*Math.PI/16)*128);g.stroke();}for(let r=12;r<128;r+=14){g.beginPath();for(let a=0;a<=8;a++){const x=Math.cos(a*Math.PI/16)*r,y=Math.sin(a*Math.PI/16)*r;a?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}}
const webMat=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(wc),transparent:true,depthWrite:false,side:THREE.DoubleSide,opacity:.6});
const archG=new THREE.TorusGeometry(T/2-.1,.18,6,10,Math.PI);const pillarG=new THREE.CylinderGeometry(.28,.34,WH,10);
const sconceG=new THREE.CylinderGeometry(.04,.06,.35,6);
MAP.forEach((r,j)=>[...r].forEach((c,i)=>{const x=i*T,z=j*T;
 if(c==='#'){dm.makeTranslation(x,WH/2,z);wallIM.setMatrixAt(wi++,dm);return;}
 if(c==='S')start.set(x,0,z);
 else if(c==='P'){const p=new THREE.Mesh(new THREE.PlaneGeometry(0.22,0.3),pageMat);p.position.set(x,1.1,z);p.add(glow(0xffd890,.6));scene.add(p);pages.push(p);
   const stand=new THREE.Mesh(new THREE.CylinderGeometry(.2,.25,.9,8),blockMat);stand.position.set(x,.45,z);scene.add(stand);}
 else if(c==='G')ghoulSpawns.push(new THREE.Vector3(x,0,z));
 else if(c==='+'){// doorway arch + broken door
   const ns=isWall(i,j-1)&&isWall(i,j+1);const a=new THREE.Mesh(archG,blockMat);a.position.set(x,2.1,z);if(ns)a.rotation.y=Math.PI/2;scene.add(a);
   for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.BoxGeometry(.3,2.1,.4),blockMat);p.position.set(ns?x:x+s*(T/2-.15),1.05,ns?z+s*(T/2-.15):z);if(ns)p.rotation.y=Math.PI/2;scene.add(p);}
   const d=new THREE.Mesh(new THREE.BoxGeometry(1,2,.08),woodMat);d.position.set(x+(ns?.4:-.9),1,z+(ns?-.9:.4));d.rotation.y=ns?.3:1.2;d.castShadow=true;scene.add(d);
   const cd=new THREE.Mesh(new THREE.CylinderGeometry(.03,.035,.18,8),new THREE.MeshStandardMaterial({color:0xeee0c0,emissive:0x221100}));cd.position.set(x+.6,.09,z+.6);const f=makeFlame(.4);f.position.y=.13;cd.add(f);scene.add(cd);}
 else if(c==='N'){gatePos.set(x,0,z);gate=new THREE.Group();const door=new THREE.Mesh(new THREE.BoxGeometry(T,WH,.25),woodMat);gate.add(door);
   for(let k=-1;k<=1;k++){const band=new THREE.Mesh(new THREE.BoxGeometry(T+.02,.12,.28),metalMat);band.position.y=k*1.1;gate.add(band);}gate.position.set(x,WH/2,z+.9);scene.add(gate);
   const sh=new THREE.Mesh(new THREE.ConeGeometry(1.2,6,8,1,true),new THREE.MeshBasicMaterial({color:0x6677aa,transparent:true,opacity:.05,blending:THREE.AdditiveBlending,depthWrite:false}));sh.position.set(x,1.5,z+2);sh.rotation.x=.5;scene.add(sh);}
 if(c==='.'||c==='G'||c==='S'){
   // pillars on a grid in open halls
   if(i%4===1&&j%4===1&&!isWall(i+1,j)&&!isWall(i-1,j)&&!isWall(i,j+1)&&!isWall(i,j-1)){const p=new THREE.Mesh(pillarG,blockMat);p.position.set(x,WH/2,z);p.castShadow=true;scene.add(p);MAP[j]=MAP[j].slice(0,i)+'O'+MAP[j].slice(i+1);}
   // wall torches on north/south wall faces
   if((i+j)%5===0){for(const [di,dj] of [[0,-1],[0,1],[-1,0],[1,0]])if(isWall(i+di,j+dj)){const sx=x+di*(T/2-.12),sz=z+dj*(T/2-.12);const s=new THREE.Mesh(sconceG,metalMat);s.position.set(sx,1.9,sz);s.rotation.set(dj*-.4,0,di*.4);scene.add(s);
     const f=makeFlame(1);f.position.set(sx-di*.05,2.15,sz-dj*.05);scene.add(f);torchSpots.push(new THREE.Vector3(sx-di*.3,2.1,sz-dj*.3));break;}}
   // cobwebs in corners
   for(const [di,dj] of [[1,1],[-1,1],[1,-1],[-1,-1]])if(isWall(i+di,j)&&isWall(i,j+dj)&&Math.random()<.5){const w=new THREE.Mesh(new THREE.PlaneGeometry(1,1),webMat);w.position.set(x+di*(T/2-.35),WH-.35,z+dj*(T/2-.35));w.rotation.set(-Math.PI/2+.6,Math.atan2(di,dj),0);scene.add(w);}
 }}));
wallIM.instanceMatrix.needsUpdate=true;scene.add(wallIM);
// debris: instanced rocks + bones
{const rockG=new THREE.DodecahedronGeometry(.12,0);const n=140;const im=new THREE.InstancedMesh(rockG,blockMat,n);let k=0;const q=new THREE.Quaternion(),s=new THREE.Vector3(),p=new THREE.Vector3(),e=new THREE.Euler();
 while(k<n){const x=Math.random()*(W-1)*T,z=Math.random()*(H-1)*T;if(solid(x,z))continue;const ii=Math.floor(x/T+.5),jj=Math.floor(z/T+.5);const nearWall=isWall(ii+1,jj)||isWall(ii-1,jj)||isWall(ii,jj+1)||isWall(ii,jj-1);if(!nearWall&&Math.random()<.7)continue;
  const sc=.4+Math.random()*1.4;e.set(Math.random()*3,Math.random()*3,0);im.setMatrixAt(k++,dm.compose(p.set(x,.04*sc,z),q.setFromEuler(e),s.set(sc,sc*.6,sc)));}
 im.receiveShadow=true;scene.add(im);
 const boneMat=new THREE.MeshStandardMaterial({color:0xcfc4a8,roughness:.8});const skullG=new THREE.SphereGeometry(.1,10,8);
 for(let k=0;k<14;k++){const x=Math.random()*(W-1)*T,z=Math.random()*(H-1)*T;if(solid(x,z))continue;const sk=new THREE.Mesh(skullG,boneMat);sk.scale.set(1,.9,1.15);sk.position.set(x,.09,z);scene.add(sk);
  for(let b=0;b<3;b++){const bn=new THREE.Mesh(new THREE.CylinderGeometry(.02,.025,.4,5),boneMat);bn.rotation.set(Math.PI/2,0,Math.random()*3);bn.position.set(x+(Math.random()-.5)*.6,.03,z+(Math.random()-.5)*.6);scene.add(bn);}}
 // barrels & crates
 const barrelG=new THREE.CylinderGeometry(.35,.32,.9,12);for(let k=0;k<10;k++){const x=Math.random()*(W-1)*T,z=Math.random()*(H-1)*T;if(solid(x,z)||solid(x+.6,z)||solid(x-.6,z)||solid(x,z+.6)||solid(x,z-.6))continue;const b=new THREE.Mesh(k%2?barrelG:new THREE.BoxGeometry(.7,.7,.7),woodMat);b.position.set(x,k%2?.45:.35,z);b.rotation.y=Math.random()*3;b.castShadow=b.receiveShadow=true;scene.add(b);}}
// wall-torch light pool (2 lights moved to the nearest sconces)
const poolLights=[0,1].map(()=>{const l=new THREE.PointLight(0xff8a3a,6,7,2);scene.add(l);return l;});

// ---- Forest level replaces the castle (castle geometry discarded) ----
for(const o of [...scene.children])if(!_preCastle.has(o))scene.remove(o);poolLights.forEach(l=>scene.add(l));
pages.length=0;ghoulSpawns.length=0;torchSpots.length=0;flames.length=0;
buildForest();

// ---- Player ----
rig.position.copy(start);
const P={...ALDEN,pages:0,dead:false,won:false,iframes:0};

// Torch (hand-held) - the single shadow-casting light
const torch=new THREE.PointLight(0xff9a48,9,10,1.8);torch.castShadow=true;torch.shadow.mapSize.set(256,256);torch.shadow.bias=-0.004;torch.shadow.camera.near=.1;torch.shadow.camera.far=10;
const torchMesh=new THREE.Group();
{const stick=new THREE.Mesh(new THREE.CylinderGeometry(.018,.024,.45,8),woodMat);stick.rotation.x=-Math.PI/2+.5;stick.position.set(0,.05,-.12);
 const head=new THREE.Mesh(new THREE.CylinderGeometry(.04,.03,.1,8),new THREE.MeshStandardMaterial({color:0x221810,roughness:1}));head.position.set(0,.16,-.3);head.rotation.x=.5;
 const f=makeFlame(1.1);f.position.set(0,.24,-.33);torch.position.set(0,.3,-.3);torchMesh.add(stick,head,f,torch);}
// Longsword: procedural PBR (metal blade with fuller, crossguard, wood grip, pommel)
const sword=new THREE.Group();
{const sh=new THREE.Shape();sh.moveTo(-.025,0);sh.lineTo(-.025,.85);sh.lineTo(0,.95);sh.lineTo(.025,.85);sh.lineTo(.025,0);
 const bg=new THREE.ExtrudeGeometry(sh,{depth:.006,bevelEnabled:true,bevelThickness:.003,bevelSize:.004,bevelSegments:1});bg.translate(0,0,-.003);bg.rotateX(-Math.PI/2);
 const steel=new THREE.MeshStandardMaterial({color:0xc8ccd2,metalness:1,roughness:.28,roughnessMap:metalMat.roughnessMap,normalMap:metalMat.normalMap,normalScale:new THREE.Vector2(.15,.15),emissive:0x0a0c10});
 const blade=new THREE.Mesh(bg,steel);blade.position.z=-.09;
 const guard=new THREE.Mesh(new THREE.BoxGeometry(.22,.025,.03),metalMat);guard.position.z=-.08;
 const grip=new THREE.Mesh(new THREE.CylinderGeometry(.016,.018,.17,8),new THREE.MeshStandardMaterial({color:0x3a2416,roughness:.9,map:woodMat.map}));grip.rotation.x=Math.PI/2;
 const pommel=new THREE.Mesh(new THREE.SphereGeometry(.028,10,8),metalMat);pommel.position.z=.1;
 sword.add(blade,guard,grip,pommel);}
const tipLocal=new THREE.Vector3(0,0,-1.03);
// Wrist HUD
const hudCanvas=document.createElement('canvas');hudCanvas.width=256;hudCanvas.height=128;const hctx=hudCanvas.getContext('2d');
const hudTex=new THREE.CanvasTexture(hudCanvas);hudTex.colorSpace=THREE.SRGBColorSpace;
const wrist=new THREE.Mesh(new THREE.PlaneGeometry(.12,.06),new THREE.MeshBasicMaterial({map:hudTex,transparent:true,toneMapped:false,fog:false}));
wrist.position.set(0,.05,.08);wrist.rotation.x=-Math.PI/2.4;

// ---- Avatar: rigged human glTF (Soldier.glb from three.js examples) dressed toward Alden ----
const gltfL=new GLTFLoader();const loadG=u=>new Promise((res,rej)=>gltfL.load(u,res,undefined,rej));
const avatar=new THREE.Group();scene.add(avatar);
const torso=new THREE.Group();scene.add(torso); // yaw frame at chest for sheath
let neckRel=new THREE.Quaternion(),av=null,avMixer=null,avActs={},bones={},avEye=1.6;
const sheathAnchor=new THREE.Group();sheathAnchor.position.set(.1,.15,.17);sheathAnchor.rotation.set(-Math.PI/2+.25,0,-.45);torso.add(sheathAnchor);
{const scab=new THREE.Mesh(new THREE.BoxGeometry(.065,.03,.98),new THREE.MeshStandardMaterial({color:0x3b2412,roughness:.7,map:woodMat.map}));scab.position.z=-.55;
 const cap=new THREE.Mesh(new THREE.BoxGeometry(.08,.04,.06),metalMat);cap.position.z=-.06;sheathAnchor.add(scab,cap);}
// Cloak (blue cloth plane attached behind torso)
const cloakMat=new THREE.MeshStandardMaterial({color:0x1c3d8f,roughness:.85,side:THREE.DoubleSide,normalMap:woodMat.normalMap,normalScale:new THREE.Vector2(.3,.3)});
const cloakG=new THREE.PlaneGeometry(.55,1.25,4,8);cloakG.translate(0,-.62,0);const cloak=new THREE.Mesh(cloakG,cloakMat);cloak.position.set(0,.2,.16);cloak.rotation.x=.08;torso.add(cloak);
const cloakBase=cloakG.attributes.position.array.slice();
let soldierGLTF=null;
async function loadAvatar(){const g=await loadG('assets/models/soldier.glb');soldierGLTF=g;av=SkeletonUtils.clone(g.scene);avatar.add(av);
 av.traverse(o=>{if(o.isBone)bones[o.name.replace('mixamorig','').replace(':','')]=o;
  if(o.isMesh){o.frustumCulled=false;o.castShadow=false;if(/visor/i.test(o.name))o.visible=false;else{o.material=o.material.clone();o.material.color.set(0x5a4232);o.material.metalness=.1;o.material.roughness=.75;}}});
 av.updateMatrixWorld(true);computeHandOffsets();
 for(const c of g.animations)c.tracks=c.tracks.filter(tr=>!/(Left|Right)(Arm|ForeArm|Hand)\.(quaternion|position|scale)$/.test(tr.name));
 avMixer=new THREE.AnimationMixer(av);for(const c of g.animations)avActs[c.name]=avMixer.clipAction(c);avActs.Idle?.play();
 av.updateMatrixWorld(true);avEye=bones.Head.getWorldPosition(new THREE.Vector3()).y+.06;neckRel=bones.Neck.getWorldQuaternion(new THREE.Quaternion());
 // hide head from first-person view (head follows HMD but is collapsed so it doesn't block the camera)
 bones.Head.scale.setScalar(.001);
 // brown hair cap to match reference (visible only in mirror/shadow -> kept small)
}
// IK helpers
const _q=new THREE.Quaternion(),_q2=new THREE.Quaternion(),_v1=new THREE.Vector3(),_v2=new THREE.Vector3(),_v3=new THREE.Vector3();
function setWorldQuat(bone,wq){bone.parent.getWorldQuaternion(_q2);bone.quaternion.copy(_q2.invert().multiply(wq));bone.updateMatrixWorld(true);}
function aim(bone,child,target){bone.getWorldPosition(_v1);child.getWorldPosition(_v2);const cur=_v2.sub(_v1).normalize(),des=_v3.copy(target).sub(_v1).normalize();
 _q.setFromUnitVectors(cur,des);bone.getWorldQuaternion(_q2);setWorldQuat(bone,_q.multiply(_q2).clone());}
function twoBoneIK(side,target,handQuat,B=bones,yawQ=torso.quaternion,poleZ=.4){const S=side?'Right':'Left';const up=B[S+'Arm'],lo=B[S+'ForeArm'],hd=B[S+'Hand'];if(!up)return;
 const sh=up.getWorldPosition(new THREE.Vector3()),el=lo.getWorldPosition(new THREE.Vector3()),wr=hd.getWorldPosition(new THREE.Vector3());
 const L1=sh.distanceTo(el),L2=el.distanceTo(wr);const d=target.clone().sub(sh);const L=Math.min(d.length(),L1+L2-1e-3);d.normalize();
 const a=(L1*L1-L2*L2+L*L)/(2*L),r=Math.sqrt(Math.max(0,L1*L1-a*a));
 const pole=new THREE.Vector3(side?.5:-.5,-1,poleZ).applyQuaternion(yawQ);pole.addScaledVector(d,-pole.dot(d)).normalize();
 const elbow=sh.clone().addScaledVector(d,a).addScaledVector(pole,r);aim(up,lo,elbow);aim(lo,hd,sh.clone().addScaledVector(d,L));
 setWorldQuat(hd,handQuat);}
// Mixamo hand: bone +Y runs along fingers. Map to controller grip: fingers forward (-Z), palm inward.
// Hand offsets derived from the rig's bind pose (robust to whatever local axes the rig uses).
// For each hand bone we measure, in bone-local space: F = wrist->middle knuckle (finger direction),
// S = pinky knuckle->index knuckle (thumb side), N = palm normal (left: F x S, right: S x F).
// WebXR spec (gripSpace): origin = centroid of the curled fingers; -Z along the held rod toward the thumb;
// back of RIGHT hand -> +X (palm -X), back of LEFT hand -> -X (palm +X); +Y roughly along the arm (toward elbow).
// So S_g=(0,0,-1), N_g=(+1|-1,0,0), and the wrist->knuckle direction F_g = -Y for both hands (verified by cross products).
// handOff[i] maps bone-local basis -> grip basis, so boneWorld = gripWorld * handOff[i] exactly.
const handOff=[new THREE.Quaternion(),new THREE.Quaternion()],palmOff=[new THREE.Vector3(0,0,.07),new THREE.Vector3(0,0,.07)];
function basis(F,S,left){F=F.clone().normalize();const N=left?F.clone().cross(S):S.clone().cross(F);N.normalize();const S2=left?N.clone().cross(F):F.clone().cross(N);// re-orthogonalise
 return new THREE.Matrix4().makeBasis(F,N,S2.normalize());}
function computeHandOffsets(){for(let i=0;i<2;i++){const L=i?'Right':'Left';const hd=bones[L+'Hand'],mid=bones[L+'HandMiddle1'],idx=bones[L+'HandIndex1'],pk=bones[L+'HandPinky1'];if(!hd||!mid||!idx||!pk)continue;
  const hw=hd.getWorldPosition(new THREE.Vector3()),mw=mid.getWorldPosition(new THREE.Vector3()),iw=idx.getWorldPosition(new THREE.Vector3()),pw=pk.getWorldPosition(new THREE.Vector3());
  const qb=hd.getWorldQuaternion(new THREE.Quaternion()),qi=qb.clone().invert();
  const Fb=mw.clone().sub(hw).applyQuaternion(qi),Sb=iw.clone().sub(pw).applyQuaternion(qi);const len=mw.distanceTo(hw);
  const Mb=basis(Fb,Sb,i===0);
  // grip-space target basis
  const Sg=new THREE.Vector3(0,0,-1),Ng=new THREE.Vector3(i===0?1:-1,0,0);const Fg=i===0?Sg.clone().cross(Ng):Ng.clone().cross(Sg);
  const Mg=basis(Fg,Sg,i===0);
  const R=Mg.clone().multiply(Mb.clone().transpose());handOff[i].setFromRotationMatrix(R);
  // wrist sits behind the fist centroid: centroid ~ 55% along fingers + 2.5cm toward palm (grip space)
  palmOff[i].copy(Fg).multiplyScalar(.85*len).addScaledVector(Ng,.03); // curled-finger centroid sits ~past the knuckles, in front of the palm
  window.__handAxes=window.__handAxes||[];window.__handAxes[i]={Fb:Fb.normalize().toArray().map(v=>+v.toFixed(3)),Sb:Sb.normalize().toArray().map(v=>+v.toFixed(3)),len:+len.toFixed(3)};}}

// ---- Controllers ----
const c0=renderer.xr.getController(0),c1=renderer.xr.getController(1);
const g0=renderer.xr.getControllerGrip(0),g1=renderer.xr.getControllerGrip(1);
rig.add(c0,c1,g0,g1);
let leftSrc=null,rightSrc=null;const gripObj=[null,null],srcs=[null,null];
[[c0,g0],[c1,g1]].forEach(([c,g])=>{c.addEventListener('connected',e=>{const s=e.data;const i=s.handedness==='left'?0:1;gripObj[i]=g;srcs[i]=s;if(i===0)leftSrc=s;else rightSrc=s;});
 c.addEventListener('disconnected',()=>{for(let i=0;i<2;i++)if(gripObj[i]===g){gripObj[i]=null;srcs[i]=null;}});});
const deskHand=[new THREE.Object3D(),new THREE.Object3D()];deskHand[0].position.set(-.22,-.42,-.4);deskHand[1].position.set(.24,-.45,-.36);camera.add(deskHand[0],deskHand[1]);
const handHolder=[new THREE.Group(),new THREE.Group()];scene.add(handHolder[0],handHolder[1]);
handHolder[0].add(wrist);
let swordHand=-1;
function sheathe(){swordHand=-1;sheathAnchor.add(sword);sword.position.set(0,0,-.08);sword.rotation.set(0,0,0);sfx?.swing();}
function draw(i){swordHand=i;handHolder[i].add(sword);sword.position.set(0,0,0);sword.quaternion.identity();sfx?.swing();}
swordHand=-1;sheathAnchor.add(sword);sword.position.set(0,0,-.08);
const torchHand=()=>{const busy=i=>swordHand===i||axeHand===i;return !busy(0)?0:!busy(1)?1:-1;};var axeHand=-1;
const gripPrev=[false,false];let moving=0;
function updateAvatar(xr,dt){const hq=camera.getWorldQuaternion(new THREE.Quaternion());camera.getWorldPosition(headW);
 const e=new THREE.Euler().setFromQuaternion(hq,'YXZ');let ty=torso.rotation.y;let dy=Math.atan2(Math.sin(e.y-ty),Math.cos(e.y-ty));
 if(Math.abs(dy)>.6)ty+=dy-Math.sign(dy)*.6;ty+=dy*Math.min(1,dt*2.5);torso.rotation.set(0,ty,0);
 const back=new THREE.Vector3(0,0,.12).applyAxisAngle(THREE.Object3D.DEFAULT_UP,ty);
 avatar.position.set(headW.x+back.x,0,headW.z+back.z);avatar.rotation.y=ty;avatar.scale.setScalar(Math.max(.8,Math.min(1.3,(headW.y-.05)/avEye)));
 // hand frames
 for(let i=0;i<2;i++){const src=xr?gripObj[i]:deskHand[i];if(!src)continue;src.updateWorldMatrix(true,false);src.matrixWorld.decompose(handHolder[i].position,handHolder[i].quaternion,_v1);
  if(!xr&&i===1&&desktopSwing>0&&(swordHand===1||axeHand===1)){const k=1-desktopSwing/.35;handHolder[i].quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.sin(k*Math.PI)*1.5,Math.sin(k*Math.PI)*.9,0)));handHolder[i].position.add(new THREE.Vector3(-Math.sin(k*Math.PI)*.2,Math.sin(k*Math.PI)*.1,0).applyQuaternion(hq));}}
 if(av){const want=moving>.05?(runningNow?'Run':'Walk'):'Idle';for(const n of ['Idle','Walk','Run']){const a=avActs[n];if(!a)continue;if(n===want&&!a.isRunning())a.reset().fadeIn(.25).play();else if(n!==want&&a.isRunning()&&a.getEffectiveWeight()>0)a.fadeOut(.25);}
  avMixer.update(dt);bones.Head.scale.setScalar(.001);av.updateMatrixWorld(true);
  if(bones.Neck){setWorldQuat(bones.Neck,hq.clone().multiply(neckRel));}
  for(let i=0;i<2;i++){if(xr&&!gripObj[i])continue;const gq=handHolder[i].quaternion.clone();const hqq=gq.clone().multiply(handOff[i]);
   const wristT=handHolder[i].position.clone().sub(palmOff[i].clone().multiplyScalar(avatar.scale.x).applyQuaternion(gq));
   twoBoneIK(i,wristT,hqq);}
  for(let i=0;i<2;i++){if(xr&&!gripObj[i])continue;const hd=bones[(i?'Right':'Left')+'Hand'];if(hd)setWorldQuat(hd,handHolder[i].quaternion.clone().multiply(handOff[i]));}
  if(bones.Spine2){bones.Spine2.getWorldPosition(torso.position);}
  {const hy=bones.Head.getWorldPosition(_v1).y/avatar.scale.y;if(hy>.5)avEye+=(hy+.1-avEye)*Math.min(1,dt*5);}}
 else torso.position.set(headW.x,headW.y-.35,headW.z).add(back);
 // cloak sway
 const pa=cloakG.attributes.position;for(let k=0;k<pa.count;k++){const y=cloakBase[k*3+1];pa.array[k*3+2]=cloakBase[k*3+2]+(-y)*(.15*moving+.03*Math.sin(clock.elapsedTime*2+y*4+cloakBase[k*3]*3));}pa.needsUpdate=true;
 // grab/sheathe (either hand)
 if(xr)for(let i=0;i<2;i++){const g=!!srcs[i]?.gamepad?.buttons[1]?.pressed;const sa=sheathAnchor.getWorldPosition(_v1);
  if(g&&!gripPrev[i]&&swordHand===-1&&axeHand!==i&&!(G.held[i])&&handHolder[i].position.distanceTo(sa)<.4&&handHolder[i].position.y>headW.y-.3){draw(i);hapticI(i,1,120);}
  if(!g&&gripPrev[i]&&swordHand===i){sheathe();hapticI(i,.6,80);}gripPrev[i]=g;}
 const th=torchHand();const tp_=th<0?hipAnchor:handHolder[th];if(torchMesh.parent!==tp_){tp_.add(torchMesh);torchMesh.position.set(0,0,0);torchMesh.rotation.set(0,0,0);if(th<0){torchMesh.position.set(.08,0,.05);torchMesh.rotation.set(.3,0,0);}}
 updateAxeHolster(xr);}
function hapticI(i,v,ms){if(!SET.haptics)return;srcs[i]?.gamepad?.hapticActuators?.[0]?.pulse?.(v,ms);}
renderer.xr.addEventListener('sessionstart',()=>{onXRStart();document.getElementById('start').style.display='none';document.getElementById('vig').style.display='none';audioStart();});
renderer.xr.addEventListener('sessionend',()=>{document.getElementById('vig').style.display='';});
// ---- Audio (Web Audio, procedural) ----
let ambBus,sfxBus,musicBus,AC=null,master,listenerPanners=[];
function audioStart(){if(AC)return;AC=new (window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.gain.value=.6;master.connect(AC.destination);ambBus=AC.createGain();sfxBus=AC.createGain();musicBus=AC.createGain();[ambBus,sfxBus,musicBus].forEach(b=>b.connect(master));applyAudio();
 // drone
 [43,45.5,64.3].forEach(f=>{const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=f;const g=AC.createGain();g.gain.value=.05;const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=180;
  const lfo=AC.createOscillator();lfo.frequency.value=.07+Math.random()*.1;const lg=AC.createGain();lg.gain.value=80;lfo.connect(lg).connect(lp.frequency);lfo.start();o.connect(lp).connect(g).connect(ambBus);o.start();});
 // wind noise
 const nb=AC.createBuffer(1,AC.sampleRate*3,AC.sampleRate);const d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
 const n=AC.createBufferSource();n.buffer=nb;n.loop=true;const bp=AC.createBiquadFilter();bp.type='bandpass';bp.frequency.value=400;bp.Q.value=.7;const ng=AC.createGain();ng.gain.value=.05;
 const wl=AC.createOscillator();wl.frequency.value=.1;const wg=AC.createGain();wg.gain.value=250;wl.connect(wg).connect(bp.frequency);wl.start();n.connect(bp).connect(ng).connect(ambBus);n.start();
 window._noise=nb;
 setInterval(()=>{if(Math.random()<.35)creak();if(Math.random()<.2)whisper();},4000);
}
function env(g,a,peak,dec){const t=AC.currentTime;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+dec);}
function creak(){const o=AC.createOscillator();o.type='square';const t=AC.currentTime;o.frequency.setValueAtTime(90+Math.random()*60,t);o.frequency.linearRampToValueAtTime(140+Math.random()*80,t+1.2);
 const f=AC.createBiquadFilter();f.type='bandpass';f.frequency.value=700;f.Q.value=8;const g=AC.createGain();env(g,.3,.06,1.2);const p=AC.createStereoPanner();p.pan.value=Math.random()*2-1;o.connect(f).connect(g).connect(p).connect(ambBus);o.start();o.stop(t+2);}
function whisper(){const s=AC.createBufferSource();s.buffer=window._noise;const f=AC.createBiquadFilter();f.type='bandpass';f.frequency.value=2500+Math.random()*1500;f.Q.value=4;const g=AC.createGain();env(g,.4,.08,1.5);const p=AC.createStereoPanner();p.pan.value=Math.random()<.5?-1:1;s.connect(f).connect(g).connect(p).connect(ambBus);s.start();s.stop(AC.currentTime+2.2);}
function sting(){if(!AC)return;const t=AC.currentTime;[220,233,311,330].forEach(fr=>{const o=AC.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(fr,t);o.frequency.exponentialRampToValueAtTime(fr*1.5,t+.6);const g=AC.createGain();env(g,.01,.12,1.4);o.connect(g).connect(sfxBus);o.start();o.stop(t+1.6);});
 const s=AC.createBufferSource();s.buffer=window._noise;const g=AC.createGain();env(g,.01,.4,.8);s.connect(g).connect(sfxBus);s.start();s.stop(t+1);}
function tone(f,type,dur,vol,slide){if(!AC)return;const o=AC.createOscillator();o.type=type;const t=AC.currentTime;o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(slide,t+dur);const g=AC.createGain();env(g,.005,vol,dur);o.connect(g).connect(sfxBus);o.start();o.stop(t+dur+.1);}
const sfx={hit:()=>{tone(120,'square',.25,.3,40);tone(900,'triangle',.08,.15)},hurt:()=>tone(80,'sawtooth',.5,.35,30),page:()=>{tone(523,'sine',.6,.15);setTimeout(()=>tone(392,'sine',.9,.12),200)},
 heal:()=>tone(330,'sine',.8,.2,660),swing:()=>{if(!AC)return;const s=AC.createBufferSource();s.buffer=window._noise;const f=AC.createBiquadFilter();f.type='highpass';f.frequency.value=1500;const g=AC.createGain();env(g,.02,.15,.18);s.connect(f).connect(g).connect(sfxBus);s.start();s.stop(AC.currentTime+.3)},
 growl:(pan)=>{if(!AC)return;const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=55+Math.random()*20;const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=400;const g=AC.createGain();env(g,.2,.12,.9);const p=AC.createStereoPanner();p.pan.value=pan;o.connect(f).connect(g).connect(p).connect(sfxBus);o.start();o.stop(AC.currentTime+1.3);}};

// ---- Creatures: Quaternius CC0 zombie (animated) for ghouls; shadow wraith variant with glowing eyes ----
let zombieG=null;const enemies=[];
const findClip=(n)=>zombieG.animations.find(a=>a.name===n)||zombieG.animations.find(a=>a.name.endsWith('|'+n));
const wraithMat=new THREE.MeshStandardMaterial({color:0x050508,roughness:1,transparent:true,opacity:.82,emissive:0x05070f});
const eyeG=new THREE.SphereGeometry(.03,8,6);
function spawn(type,pos){const m=SkeletonUtils.clone(zombieG.scene);m.scale.setScalar(zScale);let head=null;
 m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;if(type==='wraith')o.material=wraithMat;else{o.material=o.material.clone();o.material.color.multiplyScalar(.75);}}if(o.isBone&&o.name==='Head')head=o;});
 const eyes=new THREE.Group();const ec=type==='wraith'?0x66ccff:0xff3300;for(const s of [-1,1]){const e=new THREE.Mesh(eyeG,new THREE.MeshBasicMaterial({color:ec,fog:false,toneMapped:false}));e.position.set(s*.055,0,0);e.add(glow(ec,.18));eyes.add(e);}scene.add(eyes);
 m.position.copy(pos);scene.add(m);const mixer=new THREE.AnimationMixer(m);const A={};for(const n of ['Idle','Walk','Run','Punch','HitReact','Death','Run_Arms'])A[n]=findClip(n)&&mixer.clipAction(findClip(n));
 if(A.Punch){A.Punch.setLoop(THREE.LoopOnce);A.HitReact&&A.HitReact.setLoop(THREE.LoopOnce);A.Death.setLoop(THREE.LoopOnce);A.Death.clampWhenFinished=true;}
 const e={type,mesh:m,eyes,head,mixer,A,cur:null,hp:type==='wraith'?10:14,speed:type==='wraith'?1.9:1.2,dmg:type==='wraith'?[1,6,2]:[1,8,1],ac:type==='wraith'?13:12,home:pos.clone(),state:'wander',cd:0,stun:0,target:pos.clone(),growlT:Math.random()*5,phase:type==='wraith'};
 if(type==='wraith')m.scale.multiplyScalar(1.08);play(e,'Idle');enemies.push(e);return e;}
function play(e,n,fade=.25){const a=e.A[n]||e.A.Walk;if(!a||e.cur===a)return;a.reset().fadeIn(fade).play();e.cur?.fadeOut(fade);e.cur=a;}
let zScale=1;
async function loadZombies(){zombieG=await loadG('assets/models/zombie.glb');const b=new THREE.Box3().setFromObject(zombieG.scene);zScale=1.8/(b.max.y-b.min.y);
 ghoulSpawns.forEach(p=>spawn('ghoul',p));F.wraithSpawns.forEach(p=>spawn('wraith',p));}
const roll=(n,s,b)=>{let t=b;for(let i=0;i<n;i++)t+=1+Math.floor(Math.random()*s);return t;};

// ---- Jump scares ----
const scares=F.scares;
let scareE=null,scareT=0;
function jumpScare(){sting();haptic(1,300);torchFlicker=1.2;if(!zombieG)return;
 if(!scareE){scareE=spawn('ghoul',new THREE.Vector3());enemies.pop();}
 camera.getWorldDirection(fwd);fwd.y=0;fwd.normalize();scareE.mesh.position.copy(headW).addScaledVector(fwd,.85);scareE.mesh.position.y=Math.min(0,headW.y-1.65);scareE.mesh.lookAt(headW.x,scareE.mesh.position.y,headW.z);
 scareE.mesh.visible=scareE.eyes.visible=true;scareE.cur=null;play(scareE,'Punch',.05);scareT=.9;}

// ---- Particles: dust motes around player + torch embers ----
const dustN=300,dustG=new THREE.BufferGeometry(),dustP=new Float32Array(dustN*3);for(let i=0;i<dustN*3;i++)dustP[i]=(Math.random()-.5)*10;dustG.setAttribute('position',new THREE.BufferAttribute(dustP,3));
const dust=new THREE.Points(dustG,new THREE.PointsMaterial({size:.025,color:0xb0a890,transparent:true,opacity:.5,depthWrite:false,map:glowTex,blending:THREE.AdditiveBlending}));scene.add(dust);
const emN=40,emG=new THREE.BufferGeometry(),emP=new Float32Array(emN*3),emV=new Float32Array(emN*4);emG.setAttribute('position',new THREE.BufferAttribute(emP,3));
const embers=new THREE.Points(emG,new THREE.PointsMaterial({size:.03,color:0xff8a30,transparent:true,depthWrite:false,map:glowTex,blending:THREE.AdditiveBlending,fog:false}));embers.frustumCulled=false;scene.add(embers);
// low ground fog sheets
const fc=document.createElement('canvas');fc.width=fc.height=128;{const g=fc.getContext('2d');for(let i=0;i<40;i++){const x=Math.random()*128,y=Math.random()*128,r=20+Math.random()*30;const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(255,255,255,.12)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,128,128);}}
const fogTex=new THREE.CanvasTexture(fc);fogTex.wrapS=fogTex.wrapT=THREE.RepeatWrapping;fogTex.repeat.set(6,4);
const groundFog=new THREE.Mesh(new THREE.PlaneGeometry(W*T,H*T),new THREE.MeshBasicMaterial({map:fogTex,color:0x8090b0,transparent:true,opacity:.35,depthWrite:false}));groundFog.rotation.x=-Math.PI/2;groundFog.position.set((W-1)*T/2,.25,(H-1)*T/2);scene.add(groundFog);
const groundFog2=groundFog.clone();groundFog2.position.y=.6;groundFog2.material=groundFog.material.clone();groundFog2.material.opacity=.18;scene.add(groundFog2);
// ---- UI ----
const msgEl=document.getElementById('msg'),hudEl=document.getElementById('hud');let msgT=0;
const msgCanvas=document.createElement('canvas');msgCanvas.width=1024;msgCanvas.height=160;const mctx=msgCanvas.getContext('2d');const msgTex=new THREE.CanvasTexture(msgCanvas);msgTex.colorSpace=THREE.SRGBColorSpace;
const msgPlane=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.25),new THREE.MeshBasicMaterial({map:msgTex,transparent:true,depthTest:false,fog:false,toneMapped:false}));msgPlane.position.set(0,-.2,-1.5);msgPlane.renderOrder=999;camera.add(msgPlane);
function say(t,dur=5,force=false){if(!SET.subtitles&&!force){return;}msgEl.textContent=t;msgT=dur;mctx.clearRect(0,0,1024,160);mctx.fillStyle='rgba(0,0,0,.6)';mctx.fillRect(0,0,1024,160);mctx.fillStyle='#e8d8b0';mctx.font='28px serif';mctx.textAlign='center';
 const words=t.split(' ');let line='',y=50;for(const w of words){if(mctx.measureText(line+w).width>980){mctx.fillText(line,512,y);line='';y+=36;}line+=w+' ';}mctx.fillText(line,512,y);msgTex.needsUpdate=true;msgPlane.visible=true;}
function drawHud(){hctx.fillStyle='rgba(10,8,6,.85)';hctx.fillRect(0,0,256,128);hctx.fillStyle='#600';hctx.fillRect(10,10,236,28);hctx.fillStyle='#d22';hctx.fillRect(10,10,236*Math.max(0,P.hp)/P.maxHp,28);
 hctx.fillStyle='#fff';hctx.font='bold 20px sans-serif';hctx.fillText(`HP ${Math.max(0,P.hp)}/${P.maxHp}  AC ${P.ac}`,16,32);hctx.fillStyle='#e8d8b0';hctx.fillText(`Potions ${P.potions}  Pages ${P.pages}/${PAGES_NEEDED}`,12,70);
 hctx.fillStyle='#8ac';hctx.fillText(`Focus ${P.focus}/20`,12,105);hudTex.needsUpdate=true;
 hudEl.textContent=`${ALDEN.name} — HP ${Math.max(0,P.hp)}/${P.maxHp} | AC ${P.ac} | Potions ${P.potions} | Pages ${P.pages}/${PAGES_NEEDED} | Focus ${P.focus}`;}
function haptic(v,ms){if(!SET.haptics)return;for(const s of [leftSrc,rightSrc])s?.gamepad?.hapticActuators?.[0]?.pulse?.(v,ms);}
function usePotion(){if(P.dead||P.won||P.potions<=0||P.hp>=P.maxHp)return;P.potions--;const h=roll(2,4,2);P.hp=Math.min(P.maxHp,P.hp+h);sfx.heal();say(`Healing potion: +${h} HP`,2);drawHud();}
function hurt(e){if(P.iframes>0||P.dead||P.won)return;const atk=roll(1,20,3);if(atk<P.ac){say(`The ${e.type} misses — your leather armor holds.`,1.5);P.iframes=.6;return;}
 const d=roll(...e.dmg);P.hp-=d;P.iframes=1;sfx.hurt();haptic(.8,200);redFlash=.6;drawHud();if(P.hp<=0)die();}
function die(){P.dead=true;say("Alden Kael has fallen. The keep claims another Kael... Press trigger / click / R to rise again.",999,true);}
function restart(){location.reload();}
function hitEnemy(e,speed){const atk=roll(1,20,ALDEN.atk);if(atk<e.ac&&speed<4){sfx.swing();return false;}
 const d=roll(1,8,mod(ALDEN.str))+(speed>5?roll(1,4,0):0);e.hp-=d;e.stun=.7;sfx.hit();
 const push=e.mesh.position.clone().sub(rig.position).setY(0).normalize().multiplyScalar(.5);tryMove(e.mesh.position,push.x,push.z,.3);
 if(e.hp<=0){e.dead=true;e.cur=null;play(e,'Death',.1);e.deadT=3;say(`The ${e.type} collapses into dust.`,2);}else{if(e.A.HitReact){e.cur=null;play(e,'HitReact',.05);}}return true;}

// ---- Desktop input ----
const keys={};let sprintOn=false,yaw=0,pitch=0,locked=false,desktopSwing=0;
addEventListener('keydown',e=>{if(e.code==='ShiftLeft'&&!e.repeat)sprintOn=!sprintOn;if(e.code==='Escape'){togglePause();return;}if(UI.mode)return;keys[e.code]=true;if(e.code==='KeyQ')usePotion();if(e.code==='KeyR'&&(P.dead||P.won))restart();if(e.code==='KeyE'&&!renderer.xr.isPresenting)deskGrabToggle();if(e.code==='KeyG'&&!renderer.xr.isPresenting){if(axeHand>=0)holsterAxe();else{if(swordHand>=0)sheathe();if(G.held[1])release(1);drawAxe(1);}}if(e.code==='KeyF'&&!renderer.xr.isPresenting&&!G.held[1]){if(axeHand>=0)holsterAxe();swordHand===-1?draw(1):sheathe();}});
addEventListener('keyup',e=>keys[e.code]=false);
document.getElementById('play').onclick=()=>{audioStart();startCutscene();renderer.domElement.requestPointerLock?.();document.getElementById('start').style.display='none';};
renderer.domElement.addEventListener('click',()=>{if(UI.mode)return;if(CS.state!=='done'){trySkip();return;}if(P.dead||P.won)return restart();if(!locked)renderer.domElement.requestPointerLock?.();else if(G.held[1]){deskThrow();}else if(axeHand>=0&&desktopSwing<=0){desktopSwing=.35;sfx.swing();}else if(desktopSwing<=0&&swordHand>=0){desktopSwing=.35;sfx.swing();}});
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===renderer.domElement;if(!locked&&!UI.mode&&!renderer.xr.isPresenting&&CS.state==='done'&&!P.dead&&!P.won)openMenu('pause');});
addEventListener('mousemove',e=>{if(!locked)return;yaw-=e.movementX*.0025*SET.mouseSens;pitch=Math.max(-1.4,Math.min(1.4,pitch-e.movementY*.0025*SET.mouseSens*(SET.invertY?-1:1)));});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
function tryMove(pos,dx,dz,r=.3){const nx=pos.x+dx;if(!solid(nx+Math.sign(dx)*r,pos.z)&&!solid(nx+Math.sign(dx)*r,pos.z+r*.7)&&!solid(nx+Math.sign(dx)*r,pos.z-r*.7))pos.x=nx;
 const nz=pos.z+dz;if(!solid(pos.x,nz+Math.sign(dz)*r)&&!solid(pos.x+r*.7,nz+Math.sign(dz)*r)&&!solid(pos.x-r*.7,nz+Math.sign(dz)*r))pos.z=nz;}
function lineOfSight(a,b){const d=b.clone().sub(a);const n=Math.ceil(d.length()/.4);for(let i=1;i<n;i++){const p=a.clone().addScaledVector(d,i/n);if(solid(p.x,p.z))return false;}return true;}
function inFront(p){camera.getWorldDirection(fwd);fwd.y=0;fwd.normalize();const to=p.clone().sub(headW).setY(0).normalize();return fwd.dot(to)>.6;}
function segDist(a,b,p){const ab=b.clone().sub(a),l=ab.lengthSq();if(l<1e-6)return a.distanceTo(p);const k=Math.max(0,Math.min(1,p.clone().sub(a).dot(ab)/l));return a.clone().addScaledVector(ab,k).distanceTo(p);}

// ---- Loop ----
const clock=new THREE.Clock();let turning=0,snapReady=true,btnPrev={},torchFlicker=0,redFlash=0,frame=0;
const prevTip=new THREE.Vector3(),tipW=new THREE.Vector3(),headW=new THREE.Vector3(),fwd=new THREE.Vector3(),tmp=new THREE.Vector3(),tw=new THREE.Vector3();
const flashOverlay=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({color:0x880000,transparent:true,opacity:0,depthTest:false,fog:false}));flashOverlay.position.z=-.3;flashOverlay.renderOrder=1000;camera.add(flashOverlay);

function tick(){const dt=Math.min(clock.getDelta(),.05);const t=clock.elapsedTime;const xr=renderer.xr.isPresenting;frame++;
 updateUI(dt,xr);if(UI.mode&&UI.mode!=='hud'){renderer.render(rig.parent===CS.scene?CS.scene:(CS.state==='idle'&&csAlden?CS.scene:scene),camera);return;}
 if(CS.state==='idle'||CS.state==='play'){updateCutscene(dt,xr);return;}if(CS.state==='fadein')updateCutscene(dt,xr);
 if(msgT>0){msgT-=dt;if(msgT<=0){msgEl.textContent='';msgPlane.visible=false;}}
 P.iframes-=dt;redFlash=Math.max(0,redFlash-dt);flashOverlay.material.opacity=redFlash*.6;
 // fire flicker
 torchFlicker=Math.max(0,torchFlicker-dt);torch.intensity=torchFlicker>0?(Math.random()<.5?.6:8):5.5+Math.sin(t*13)*.6+Math.sin(t*31)*.4+Math.random()*.4;
 for(const f of flames){const k=1+Math.sin(t*17+f.ph)*.12+Math.random()*.08;f.core.scale.setScalar(.25*f.s*k);f.outer.scale.set(.6*f.s*k,.75*f.s*k,1);}
 // shadows: update torch shadow every other frame in XR (perf)
 renderer.shadowMap.autoUpdate=!xr||frame%2===0;
 let mx=0,mz=0,sprint=false;
 if(!xr){camera.rotation.set(pitch,yaw,0,'YXZ');if(keys.KeyW)mz-=1;if(keys.KeyS)mz+=1;if(keys.KeyA)mx-=1;if(keys.KeyD)mx+=1;sprint=SET.sprintMode==='Toggle'?sprintOn:keys.ShiftLeft;if(desktopSwing>0)desktopSwing-=dt;}
 else{const ls=(SET.leftHanded?rightSrc:leftSrc)?.gamepad,rs=(SET.leftHanded?leftSrc:rightSrc)?.gamepad;
  if(ls){mx=ls.axes[2]||0;mz=ls.axes[3]||0;if(Math.abs(mx)<.15)mx=0;if(Math.abs(mz)<.15)mz=0;if(SET.armSwing)sprint=armSwingRun(dt);else{const sc=!!ls.buttons[3]?.pressed;if(SET.sprintMode==='Toggle'){if(sc&&!btnPrev.sc)sprintOn=!sprintOn;sprint=sprintOn;}else sprint=sc;btnPrev.sc=sc;}}
  if(rs){const ax=rs.axes[2]||0;camera.getWorldPosition(headW);
   const turn=ang=>{const off=rig.position.clone().sub(headW);off.applyAxisAngle(THREE.Object3D.DEFAULT_UP,ang);rig.position.copy(headW.clone().add(off)).setY(0);rig.rotateY(ang);};
   if(SET.turnMode==='Smooth'){if(Math.abs(ax)>.2){turn(-ax*SET.turnSpeed*Math.PI/180*dt);turning=Math.abs(ax);}}
   else{if(Math.abs(ax)>.7&&snapReady){snapReady=false;turn(-Math.sign(ax)*SET.snapAngle*Math.PI/180);}
   if(Math.abs(ax)<.3)snapReady=true;}}
  for(const [s,k] of [[leftSrc,'l'],[rightSrc,'r']]){const b=s?.gamepad?.buttons;if(!b)continue;const pot=b[4]?.pressed,trig=b[0]?.pressed;
   if(pot&&!btnPrev[k+'p'])usePotion();if(trig&&!btnPrev[k+'t']&&(P.dead||P.won))restart();btnPrev[k+'p']=pot;btnPrev[k+'t']=trig;}}
 updateVignette(xr,(mx||mz)?Math.min(1,Math.hypot(mx,mz)):0,dt);
 runningNow=!!sprint&&!!(mx||mz);
 moving+=((mx||mz)&&!P.dead?1:0)-moving>0?dt*4:-dt*4;moving=Math.max(0,Math.min(1,moving));
 if(!P.dead&&!P.won&&(mx||mz)){camera.getWorldDirection(fwd);fwd.y=0;fwd.normalize();const right=tmp.crossVectors(fwd,THREE.Object3D.DEFAULT_UP).normalize();
  const sp=MOVE*(sprint?1.6:1)*dt;const dx=(fwd.x*-mz+right.x*mx)*sp,dz=(fwd.z*-mz+right.z*mx)*sp;
  camera.getWorldPosition(headW);const hp=new THREE.Vector3(headW.x,0,headW.z);const before=hp.clone();tryMove(hp,dx,dz);rig.position.x+=hp.x-before.x;rig.position.z+=hp.z-before.z;}
 camera.updateMatrixWorld(true);camera.getWorldPosition(headW);const pp=new THREE.Vector3(headW.x,0,headW.z);
 updateAvatar(xr,dt);updateGrab(dt,xr,pp);updateAxe(dt,xr,pp);updateFallingTrees(dt);
 // wall torch light pool -> nearest sconces
 if(frame%15===0){const s=torchSpots.slice().sort((a,b)=>a.distanceToSquared(pp)-b.distanceToSquared(pp));poolLights.forEach((l,i)=>s[i]&&l.position.copy(s[i]));}
 poolLights.forEach((l,i)=>l.intensity=5+Math.sin(t*11+i*3)*.8+Math.random()*.5);
 // particles
 const dp=dustG.attributes.position.array;for(let i=0;i<dustN;i++){dp[i*3+1]+=Math.sin(t+i)*.0008;dp[i*3]+=Math.cos(t*.3+i)*.0008;}
 dust.position.set(pp.x,1.5,pp.z);dustG.attributes.position.needsUpdate=true;
 torch.getWorldPosition(tw);for(let i=0;i<emN;i++){emV[i*4+3]-=dt;if(emV[i*4+3]<=0){emP[i*3]=tw.x;emP[i*3+1]=tw.y-.05;emP[i*3+2]=tw.z;emV[i*4]=(Math.random()-.5)*.2;emV[i*4+1]=.3+Math.random()*.5;emV[i*4+2]=(Math.random()-.5)*.2;emV[i*4+3]=.5+Math.random()*1.2;}
  emP[i*3]+=emV[i*4]*dt;emP[i*3+1]+=emV[i*4+1]*dt;emP[i*3+2]+=emV[i*4+2]*dt;}emG.attributes.position.needsUpdate=true;
 if(F.chunks&&frame%10===0){const cd=Math.min(60,48/Math.max(.4,SET.fog));for(const c of F.chunks)c.im.visible=Math.abs(c.z-pp.z)<cd+12;}
 fogTex.offset.x=t*.01;if(F.sky){F.sky.position.copy(pp);F.sky.material.uniforms.uT.value=t;}groundFog2.material.map.offset.y=t*.006;
 // sword tip velocity
 sword.updateWorldMatrix(true,false);tipW.copy(tipLocal).applyMatrix4(sword.matrixWorld);const tipSpeed=prevTip.distanceTo(tipW)/Math.max(dt,1e-3);
 const swinging=swordHand>=0&&(xr?tipSpeed>2.2:desktopSwing>0.05&&desktopSwing<.3);
 // pages
 for(const p of pages){if(!p.visible)continue;p.rotation.y+=dt;p.position.y=1.15+Math.sin(t*2)*.05;if(p.position.distanceTo(tmp.set(pp.x,1.15,pp.z))<1){p.visible=false;
  say(JOURNAL[P.pages],8,true);P.pages++;sfx.page();drawHud();
  if(P.pages===3){enemies.forEach(e=>e.speed*=1.2);setTimeout(()=>{if(zombieG){const w=spawn('wraith',pp.clone().add(new THREE.Vector3(0,0,-T)));w.state='hunt';}jumpScare();},2500);}
  if(P.pages>=PAGES_NEEDED){setTimeout(()=>say("Every page found. The house at the end of the trail holds the rest of the truth.",6),8500);enemies.forEach(e=>{e.state='hunt';e.speed*=1.15});}}}
 if(!P.won&&F.door&&pp.distanceTo(F.door)<2.6){P.won=true;say(`Alden reaches the old house. The door creaks open on its own... (${P.pages}/${PAGES_NEEDED} pages) — Chapter 1 complete. More to come. Trigger/click/R to replay.`,999,true);}
 for(const s of scares)if(!s.done&&Math.hypot(pp.x-s.x,pp.z-s.z)<1.6){s.done=true;jumpScare();}
 if(scareE&&scareT>0){scareT-=dt;scareE.mixer.update(dt);scareE.head?.getWorldPosition(scareE.eyes.position);if(scareT<=0)scareE.mesh.visible=scareE.eyes.visible=false;}
 // enemies
 for(const e of enemies){const m=e.mesh;e.mixer.update(dt);
  if(e.dead){e.deadT-=dt;e.eyes.visible=false;if(e.deadT<=0&&m.parent){scene.remove(m);scene.remove(e.eyes);}continue;}
  if(e.head){e.head.getWorldPosition(e.eyes.position);e.eyes.quaternion.copy(m.quaternion);e.eyes.translateZ(.12);}
  const d=m.position.distanceTo(pp);e.stun-=dt;e.cd-=dt;
  const sees=d<9&&lineOfSight(tmp.set(m.position.x,1.5,m.position.z),new THREE.Vector3(pp.x,1.5,pp.z));
  if(sees&&e.state!=='hunt'){e.state='hunt';sfx.growl(Math.max(-1,Math.min(1,(m.position.x-pp.x)/5)));}
  if(!sees&&e.state==='hunt'&&d>12&&!gateOpen)e.state='wander';
  if(e.stun<=0){let goal;if(e.state==='hunt')goal=pp;else{if(m.position.distanceTo(e.target)<.5||Math.random()<.005)e.target.set(e.home.x+(Math.random()-.5)*8,0,e.home.z+(Math.random()-.5)*8);goal=e.target;}
   const dir=goal.clone().sub(m.position).setY(0);
   if(dir.length()>.9){dir.normalize();let sp=e.speed*(e.state==='hunt'?1:.4)*dt;
    if(e.type==='wraith'){camera.getWorldDirection(fwd);const to=m.position.clone().sub(pp).normalize();if(fwd.dot(to)>.8&&d<6)sp*=.15;wraithMat.opacity=.6+Math.sin(t*3)*.25;}
    if(e.phase){m.position.x+=dir.x*sp;m.position.z+=dir.z*sp;}else tryMove(m.position,dir.x*sp,dir.z*sp);
    m.lookAt(goal.x,m.position.y,goal.z);if(e.cd<=0)play(e,e.state==='hunt'?(e.type==='wraith'?'Run_Arms':'Run'):'Walk');}
   else if(e.cd<=0)play(e,'Idle');
   m.position.y=e.type==='wraith'?.15+Math.sin(t*2+e.home.x)*.1:0;
   if(d<1.2&&e.cd<=0){e.cd=1.4;e.cur=null;play(e,'Punch',.1);setTimeout(()=>{if(!e.dead&&e.mesh.position.distanceTo(new THREE.Vector3(headW.x,0,headW.z))<1.5)hurt(e);},350);}}
  e.growlT-=dt;if(e.growlT<=0){e.growlT=4+Math.random()*6;if(d<10)sfx.growl(Math.max(-1,Math.min(1,(m.position.x-pp.x)/5)));}
  if(swinging&&!P.dead){const c=tmp.set(m.position.x,1.2,m.position.z);
   const near=segDist(prevTip,tipW,c)<.5||tipW.distanceTo(c)<.6||(!xr&&d<2.2&&inFront(m.position));if(near&&(e.hitCd||0)<=0){e.hitCd=.4;if(hitEnemy(e,xr?tipSpeed:5))hapticI(swordHand,1,90);}}
  e.hitCd=(e.hitCd||0)-dt;}
 if(swinging&&SET.physics)weaponTreeHit(tipW,tipW.clone().sub(prevTip).divideScalar(Math.max(dt,1e-3)),tipSpeed,false,swordHand,xr);
 prevTip.copy(tipW);
 if(debugCam){camera.getWorldDirection(fwd);debugCam.position.copy(headW).addScaledVector(fwd,1.8);debugCam.position.y=1.4;debugCam.lookAt(headW.x,1.0,headW.z);debugCam.layers.enableAll();renderer.render(scene,debugCam);}else renderer.render(scene,camera);}
let debugCam=null;

function introMsg(){say("Your sword rests on your back: reach over your shoulder and squeeze GRIP (desktop: F). Alden Kael, former city guard. The forest is silent. Follow the torch-lit trail through the forest to the old house. Journal pages lie along the way.",8);}drawHud();
Promise.all([loadAvatar(),loadZombies(),loadForestModels(),loadAxe()]).then(()=>{buildCutscene();loadEl.textContent='';window.__ready=true;onAssetsReady();}).catch(err=>{console.error('Asset load failed',err);loadEl.textContent='Asset load failed: '+err.message;});
window.__game={P,enemies,breakdown:()=>{const r={};scene.traverse(o=>{if((o.isMesh||o.isPoints||o.isSprite)&&o.visible){let v=o;while(v){if(!v.visible)return;v=v.parent;}const n=o.isInstancedMesh?'inst:'+(o.geometry.attributes.position.count):o.isSkinnedMesh?'skinned':o.isSprite?'sprite':o.type;const t=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);r[n]=r[n]||[0,0];r[n][0]++;r[n][1]+=t|0;}});return r},treeTris:()=>F.treeGeos.map(g=>g.attributes.position.count/3),swordBox:()=>{const b=new THREE.Box3().setFromObject(sword);return [b.min.toArray(),b.max.toArray(),sword.children[0]?.scale.x]},tp:(x,z,y)=>{rig.position.set(x,0,z);yaw=y||0;},trailX,F:()=>F,CS:()=>({state:CS.state,t:+CS.t.toFixed(2)}),skip:()=>trySkip(true),handOff,palmOff,chk:()=>[0,1].map(i=>{const hd=bones[(i?"Right":"Left")+"Hand"];const bq=hd.getWorldQuaternion(new THREE.Quaternion());const want=handHolder[i].quaternion.clone().multiply(handOff[i]);const f=new THREE.Vector3(0,1,0).applyQuaternion(bq),fg=new THREE.Vector3(0,-1,0).applyQuaternion(handHolder[i].quaternion);const c=bones[(i?"Right":"Left")+"HandMiddle1"].getWorldPosition(new THREE.Vector3());return {angErrDeg:+(bq.angleTo(want)*57.3).toFixed(2),fingerDirErrDeg:+(f.angleTo(fg)*57.3).toFixed(2),knuckleToGrip:+c.distanceTo(handHolder[i].position).toFixed(3)}}),dbg:()=>{const r={};for(const n of ["LeftArm","LeftForeArm","LeftHand","RightHand","Head"])r[n]=bones[n].getWorldPosition(new THREE.Vector3()).toArray().map(v=>+v.toFixed(2));r.h0=handHolder[0].position.toArray().map(v=>+v.toFixed(2));r.h1=handHolder[1].position.toArray().map(v=>+v.toFixed(2));r.cam=headW.toArray().map(v=>+v.toFixed(2));r.avEye=avEye;r.avy=avatar.position.y;return r},look:(y,p)=>{yaw=y;pitch=p},debug:(on)=>{debugCam=on?new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.05,50):null},get swordHand(){return swordHand}};

// =================== OPENING CUTSCENE ===================
// Desktop: one continuous eased camera move (sky -> descent -> close-up on Alden's head).
// VR (comfort): fixed viewpoints joined by fades to black, with only a very slow eased drift; the user can always look around.
const CS={state:'idle',t:0,shot:-1,scene:new THREE.Scene(),fade:1,skipShown:false,nextBeat:0,nextLight:2,lightT:0,flash:0};
const csCam=new THREE.Object3D();
const fadeSphere=new THREE.Mesh(new THREE.SphereGeometry(.4,12,8),new THREE.MeshBasicMaterial({color:0,side:THREE.BackSide,transparent:true,opacity:1,depthTest:false,depthWrite:false,fog:false}));fadeSphere.renderOrder=2000;camera.add(fadeSphere);
let csBack=null,csAlden=null,csBones={},csMixer=null,skyMat=null,csHemi=null,csMoon=null,csRest=[new THREE.Vector3(),new THREE.Vector3()];
const ALDEN_POS=new THREE.Vector3(0,0,0);
function buildCutscene(){const S=CS.scene;S.background=new THREE.Color(0x02030a);S.fog=new THREE.FogExp2(0x0a0d18,.025);
 csHemi=new THREE.HemisphereLight(0x5a6c9a,0x0a0806,.6);S.add(csHemi);
 csMoon=new THREE.DirectionalLight(0xaabbee,1.4);csMoon.position.set(-20,40,-30);S.add(csMoon);
 const rim=new THREE.PointLight(0x7890ff,4,6,2);rim.position.set(0,2.4,-1.5);S.add(rim);
 const face=new THREE.PointLight(0xff9a50,1.5,4,2);face.position.set(.4,1.4,1.2);S.add(face);
 // sky dome: animated fbm clouds + moon glow + lightning
 skyMat=makeSkyMat();
 const sky=new THREE.Mesh(new THREE.SphereGeometry(150,32,16),skyMat);S.add(sky);
 // courtyard before the keep
 const g=new THREE.PlaneGeometry(80,80);g.attributes.uv.array.forEach((v,i,a)=>a[i]=v*20);const ground=new THREE.Mesh(g,F.groundMat);ground.rotation.x=-Math.PI/2;S.add(ground);
 // forest clearing around Alden: same procedural dead trees + fire-sticks as the level
 F.treeGeos.forEach((tg,v)=>{const n=18;const im=new THREE.InstancedMesh(tg,barkMat,n);const m=new THREE.Matrix4();for(let k=0;k<n;k++){const ang=(k/n)*Math.PI*2+v*.7+Math.random()*.2,r=5+Math.random()*16;const tx=Math.cos(ang)*r,tz=Math.sin(ang)*r;if((Math.abs(tx)<4.5&&tz>-3)||Math.hypot(tx,tz)<4){m.makeScale(0,0,0);im.setMatrixAt(k,m);continue;}
   m.compose(new THREE.Vector3(tx,0,tz),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.random()*6,0)),new THREE.Vector3().setScalar(.8+Math.random()*.6));im.setMatrixAt(k,m);}S.add(im);});
 for(const x of [-1.8,1.8]){const st=new THREE.Mesh(new THREE.CylinderGeometry(.03,.04,1.5,6),barkMat);st.position.set(x,.75,-2);S.add(st);const f=makeFlame(1.2);f.position.set(x,1.6,-2);S.add(f);const l=new THREE.PointLight(0xff8a3a,5,8,2);l.position.set(x,1.7,-1.8);S.add(l);}
 for(let k=0;k<30;k++){const r=new THREE.Mesh(new THREE.DodecahedronGeometry(.15+Math.random()*.2,0),blockMat);r.position.set((Math.random()-.5)*20,.05,(Math.random()-.5)*14);S.add(r);}
 const gf=groundFog.clone();gf.position.set(0,.3,0);S.add(gf);
 // Alden (visible head, cloak, sheathed sword)
 csAlden=SkeletonUtils.clone(soldierGLTF.scene);csAlden.traverse(o=>{if(o.isBone)csBones[o.name.replace('mixamorig','').replace(':','')]=o;if(o.isMesh){o.frustumCulled=false;if(/visor/i.test(o.name))o.visible=false;else{o.material=o.material.clone();o.material.color.set(0x5a4232);o.material.roughness=.75;o.material.metalness=.1;}}});
 csAlden.position.copy(ALDEN_POS);S.add(csAlden);
 const hair=new THREE.Mesh(new THREE.SphereGeometry(.11,12,8,0,Math.PI*2,0,1.5),new THREE.MeshStandardMaterial({color:0x4a2e18,roughness:.9}));
 csAlden.updateMatrixWorld(true);const hb=csBones.Head;const hs=hb.getWorldScale(new THREE.Vector3()).x;hair.scale.setScalar(1/hs);hair.position.set(0,.09/hs,-.01/hs);hb.add(hair);
 csAlden.rotation.y=Math.PI;
 csBack=new THREE.Group();S.add(csBack);const cl=new THREE.Mesh(cloakG.clone(),cloakMat);cl.position.set(0,.2,.16);cl.rotation.x=.08;csBack.add(cl);
 const sh=sheathAnchor.clone(true);csBack.add(sh);
 csMixer=new THREE.AnimationMixer(csAlden);const idle=soldierGLTF.animations.find(a=>a.name==='Idle');if(idle)csMixer.clipAction(idle).play();
 renderer.compile(S,camera);}
function startCutscene(){if(CS.state!=='idle'||!csAlden){if(!csAlden&&CS.state==='idle')CS.pending=true;return;}
 CS.state='play';CS.t=0;CS.shot=-1;camera.far=220;camera.updateProjectionMatrix();audioStart();csAudioSwell();scene.remove(rig);CS.scene.add(rig);msgPlane.visible=false;msgEl.textContent='';}
function trySkip(force){if(CS.state!=='play')return;if(!force&&CS.t<3)return;CS.t=Math.max(CS.t,TOTAL-1.2);}
const TOTAL=26;
// VR shots: [start,end, rig position, rig yaw]
const VR_SHOTS=[[0,7,new THREE.Vector3(0,30,14),0,new THREE.Vector3(0,30,14)],[7,13.5,new THREE.Vector3(0,0,6),0,new THREE.Vector3(0,0,4.6)],[13.5,TOTAL,new THREE.Vector3(.05,0,1.45),0,new THREE.Vector3(.05,0,1.3)]];
const ease=x=>x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;const lerp=(a,b,k)=>a+(b-a)*k;const clamp01=x=>Math.max(0,Math.min(1,x));
const camPath=[ // desktop keyframes: time, position, lookAt
 [0,new THREE.Vector3(0,34,16),new THREE.Vector3(-14,60,-30)],
 [6,new THREE.Vector3(0,30,14),new THREE.Vector3(0,20,-10)],
 [11,new THREE.Vector3(.5,8,6),new THREE.Vector3(0,1.5,0)],
 [14.5,new THREE.Vector3(.3,2.2,2.2),new THREE.Vector3(0,1.55,0)],
 [17,new THREE.Vector3(.1,1.65,1.05),new THREE.Vector3(0,1.6,0)],
 [TOTAL,new THREE.Vector3(.05,1.62,.85),new THREE.Vector3(0,1.6,0)]];
const _cp=new THREE.Vector3(),_cl=new THREE.Vector3();
function updateCutscene(dt,xr){const t0=clock.elapsedTime;
 for(const f of flames){const k=1+Math.sin(t0*17+f.ph)*.12+Math.random()*.08;f.core.scale.setScalar(.25*f.s*k);f.outer.scale.set(.6*f.s*k,.75*f.s*k,1);}
 if(skyMat)skyMat.uniforms.uT.value=t0;
 if(CS.state==='idle'){if(CS.pending&&csAlden){CS.pending=false;startCutscene();}renderer.render(csAlden?CS.scene:scene,camera);return;}
 if(CS.state==='play'){CS.t+=dt;const t=CS.t;
  if(t>3&&!CS.skipShown){CS.skipShown=true;msgEl.textContent='Click / trigger to skip';}
  // skip via trigger in VR
  for(const [s,k] of [[leftSrc,'l'],[rightSrc,'r']]){const tr=s?.gamepad?.buttons[0]?.pressed;if(tr&&!btnPrev['cs'+k])trySkip();btnPrev['cs'+k]=tr;}
  // lightning
  CS.nextLight-=dt;if(CS.nextLight<=0&&t<20){CS.nextLight=2.5+Math.random()*4;CS.lightT=.45;setTimeout(thunder,600+Math.random()*900);}
  if(CS.lightT>0){CS.lightT-=dt;const k=CS.lightT;CS.flash=(k>.35||(k>.15&&k<.25))?1:0;}else CS.flash=0;
  skyMat.uniforms.uFlash.value=CS.flash;csHemi.intensity=.6+CS.flash*2.5;csMoon.intensity=1.4+CS.flash*3;
  // camera
  let fade=0;
  if(xr){const sh=VR_SHOTS.findIndex(s=>t>=s[0]&&t<s[1]);const s=VR_SHOTS[Math.max(0,sh)];const k=ease(clamp01((t-s[0])/(s[1]-s[0])));
   rig.position.lerpVectors(s[2],s[4],k);rig.rotation.set(0,s[3],0);
   const into=t-s[0],outof=s[1]-t;fade=Math.max(clamp01(1-into/1.0),sh<VR_SHOTS.length-1?clamp01(1-outof/0.8):0);}
  else{let i=0;while(i<camPath.length-2&&t>camPath[i+1][0])i++;const a=camPath[i],b=camPath[i+1];const k=ease(clamp01((t-a[0])/(b[0]-a[0])));
   _cp.lerpVectors(a[1],b[1],k);_cl.lerpVectors(a[2],b[2],k);rig.position.set(_cp.x,_cp.y-1.7,_cp.z);rig.rotation.set(0,0,0);camera.position.set(0,1.7,0);rig.updateMatrixWorld(true);camera.lookAt(_cl);fade=clamp01(1-t/1.5);}
  if(t>TOTAL-1.5)fade=Math.max(fade,clamp01((t-(TOTAL-1.5))/1.2));
  fadeSphere.material.opacity=fade;
  animateAlden(t,dt);csAudioTick(t,dt);
  if(t>=TOTAL){endCutscene();}
  renderer.render(CS.scene,camera);return;}
 if(CS.state==='fadein'){CS.t+=dt;fadeSphere.material.opacity=clamp01(1-CS.t/1.5);if(CS.t>1.5){CS.state='done';fadeSphere.visible=false;}}
}
function endCutscene(){camera.far=60;camera.updateProjectionMatrix();CS.scene.remove(rig);scene.add(rig);rig.position.copy(start);rig.rotation.set(0,0,0);camera.position.set(0,1.7,0);camera.rotation.set(0,0,0);yaw=0;pitch=0;
 CS.state='fadein';CS.t=0;fadeSphere.material.opacity=1;msgEl.textContent='';csSwell?.gain.setTargetAtTime(0,AC.currentTime,.5);introMsg();clock.getDelta();}
// struggle choreography on the cutscene Alden (IK hands, head jerks, torso twist)
const _hq=new THREE.Quaternion(),_m4=new THREE.Matrix4();
function animateAlden(t,dt){csMixer.update(dt);csAlden.updateMatrixWorld(true);const B=csBones;const s=t-15; // struggle starts at 15s
 const yawQ=csAlden.quaternion.clone(); // same convention as the player avatar
 const head=B.Head.getWorldPosition(new THREE.Vector3());
 const sp=B.Spine2,nk=B.Neck;
 // torso twist + head jerks
 const intensity=clamp01(s/2)*(s<9.5?1:clamp01(1-(s-9.5)/1.5));
 const jx=(Math.sin(t*7.3)+Math.sin(t*13.1)*.6)*.18*intensity,jy=(Math.sin(t*5.1)+Math.sin(t*11.7)*.5)*.35*intensity;
 if(sp)sp.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(.1*intensity+Math.sin(t*3)*.08*intensity,Math.sin(t*2.3)*.35*intensity,0)));
 if(nk)nk.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(jx+(s>0&&s<3?.25:0),jy,Math.sin(t*9)*.15*intensity)));
 if(s<0){const k=clamp01((t-12)/2);nk&&nk.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-.15*k,Math.sin(t*1.5)*.2*k,0)));} // uneasy glances
 csAlden.updateMatrixWorld(true);B.Spine2.getWorldPosition(csBack.position);csBack.quaternion.copy(csAlden.quaternion);
 for(let i=0;i<2;i++){const side=i?-1:1; // model faces +Z, so its left (i=0) is +X
  const sh=B[(i?'Right':'Left')+'Arm'].getWorldPosition(new THREE.Vector3());
  const rest=sh.clone().add(new THREE.Vector3(side*.12,-.5,.06));
  const face=head.clone().add(new THREE.Vector3(side*.09,.02,.13));
  const flail=sh.clone().add(new THREE.Vector3(side*(.35+.15*Math.sin(t*6+i*2)),.05+.3*Math.sin(t*8.3+i*1.3),.25+.15*Math.sin(t*5.7+i)));
  let tgt;if(s<0)tgt=rest;else if(s<2.5)tgt=rest.clone().lerp(face,ease(clamp01(s/2.5)));else if(s<4.5)tgt=face.clone().add(new THREE.Vector3(Math.sin(t*9+i)*.02,Math.sin(t*7)*.02,0));
  else if(s<9.5){const k=ease(clamp01((s-4.5)/.6));tgt=face.clone().lerp(flail,k);if(s>8.2)tgt.lerp(face,ease(clamp01((s-8.2)/1.3)));}else tgt=face;
  // hand orientation: grip -Z (thumb side) points up, palm toward the face/body
  const ideal=_m4.lookAt(tgt,tgt.clone().add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,0,1));_hq.setFromRotationMatrix(ideal);
  if(s>=0)_hq.premultiply(new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP,side*-.6));
  twoBoneIK(i,tgt,_hq.clone().multiply(handOff[i]),B,yawQ,.4);}
}
// cutscene audio: ominous swell, thunder, heartbeat, whispers
let csSwell=null;
function csAudioSwell(){if(!AC)return;const t=AC.currentTime;csSwell=AC.createGain();csSwell.gain.setValueAtTime(0,t);csSwell.gain.linearRampToValueAtTime(.35,t+14);csSwell.connect(musicBus);
 for(const f of [36.7,55,73.4,77.8]){const o=AC.createOscillator();o.type=f>70?'triangle':'sawtooth';o.frequency.setValueAtTime(f,t);o.frequency.linearRampToValueAtTime(f*1.03,t+24);const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(120,t);lp.frequency.linearRampToValueAtTime(900,t+22);const g=AC.createGain();g.gain.value=.12;o.connect(lp).connect(g).connect(csSwell);o.start();o.stop(t+30);}}
function thunder(){if(!AC||CS.state!=='play')return;const s=AC.createBufferSource();s.buffer=window._noise;const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=180;const g=AC.createGain();const t=AC.currentTime;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.6,t+.15);g.gain.exponentialRampToValueAtTime(.001,t+2.8);s.connect(f).connect(g).connect(sfxBus);s.start();s.stop(t+3);}
function beat(v){if(!AC)return;for(const [d,a] of [[0,1],[.18,.7]]){const o=AC.createOscillator();o.type='sine';const t=AC.currentTime+d;o.frequency.setValueAtTime(70,t);o.frequency.exponentialRampToValueAtTime(38,t+.15);const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v*a,t+.01);g.gain.exponentialRampToValueAtTime(.001,t+.25);o.connect(g).connect(sfxBus);o.start(t);o.stop(t+.3);}}
function csAudioTick(t,dt){if(!AC)return;if(t>11){CS.nextBeat-=dt;if(CS.nextBeat<=0){const s=clamp01((t-11)/10);CS.nextBeat=1.1-s*.6;beat(.25+s*.35);}}
 if(t>14&&t<TOTAL-1&&Math.random()<dt*(t>16?4:1.5))whisper();}

function makeSkyMat(){return new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{uT:{value:0},uFlash:{value:0},uMoon:{value:new THREE.Vector3(-.35,.75,-.55).normalize()}},
  vertexShader:`varying vec3 vD;void main(){vD=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec3 vD;uniform float uT,uFlash;uniform vec3 uMoon;
  float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
  void main(){vec3 d=normalize(vD);float up=max(d.y,0.);vec2 uv=d.xz/(d.y+.25)*1.4;
   float c=fbm(uv+vec2(uT*.03,uT*.012));float c2=fbm(uv*1.7-vec2(uT*.05,0.));float cl=smoothstep(.42,.8,c*.65+c2*.45);
   float m=max(dot(d,uMoon),0.);vec3 sky=mix(vec3(.01,.012,.03),vec3(.03,.04,.08),up);
   vec3 moonGlow=vec3(.55,.62,.8)*(pow(m,600.)*6.+pow(m,20.)*.35+pow(m,4.)*.08);
   vec3 cloudCol=vec3(.06,.065,.08)+vec3(.35,.4,.55)*pow(m,6.)*.7+vec3(.6,.65,.9)*uFlash*(.4+c);
   vec3 col=sky+moonGlow*(1.-cl*.85);col=mix(col,cloudCol,cl*smoothstep(-.05,.15,d.y));col+=vec3(.5,.55,.8)*uFlash*.15;
   col=mix(vec3(.02,.025,.04),col,smoothstep(-.1,.05,d.y));gl_FragColor=vec4(col,1.);}`});}

// =================== FOREST LEVEL ===================
// Dirt trail through a dead forest to an old house. Trees are procedural branching trunks with Poly Haven bark PBR,
// instanced (4 variants); ground cover / rocks / logs / torch / house / sword are downloaded CC0 models (see CREDITS.txt).
var F, barkMat;
function trailX(z){return Math.sin(z*.045)*7+Math.sin(z*.013+1)*4;}
function hash2(x,z){const s=Math.sin(x*127.1+z*311.7)*43758.5453;return s-Math.floor(s);}
function makeDeadTree(seed){let r=seed*9301+49297;const rnd=()=>{r=(r*9301+49297)%233280;return r/233280;};const parts=[];
 function branch(p,dir,len,rad,depth){const g=new THREE.CylinderGeometry(rad*.68,rad,len,depth>2?7:depth>0?5:3,1,true);g.translate(0,len/2,0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir));g.translate(p.x,p.y,p.z);
  const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*Math.max(1,rad*12),uv.getY(i)*len*.8);parts.push(g);
  const end=p.clone().addScaledVector(dir,len);if(depth<=0)return;
  const n=depth>2?2+Math.floor(rnd()*2):1+Math.floor(rnd()*2);
  for(let k=0;k<n;k++){const d=dir.clone().add(new THREE.Vector3((rnd()-.5)*1.6,(rnd()-.2)*.6,(rnd()-.5)*1.6)).normalize();branch(end,d,len*(.55+rnd()*.25),rad*.62,depth-1);}
  if(depth>2){const d=dir.clone().add(new THREE.Vector3((rnd()-.5)*.3,0,(rnd()-.5)*.3)).normalize();branch(end,d,len*.8,rad*.75,depth-1);}}
 branch(new THREE.Vector3(0,-.3,0),new THREE.Vector3((rnd()-.5)*.1,1,(rnd()-.5)*.1).normalize(),3+rnd()*2.5,.28+rnd()*.12,4);
 // root flare
 const fl=new THREE.CylinderGeometry(.3,.55,.6,7,1,true);fl.translate(0,.0,0);parts.push(fl);
 return mergeGeometries(parts.map(g=>g.toNonIndexed()));}
function buildForest(){F={trees:[],door:null,scares:[],wraithSpawns:[],sky:null,treeGeos:[]};
 barkMat=pbr('bark',1,1,{color:0x8a8078});
 F.groundMat=pbr('forest',1,1,{color:0x7a7468});
 const trailMat=pbr('trail',1,1,{color:0x9a8a78,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 scene.fog=new THREE.FogExp2(0x0a0d12,.055*SET.fog);scene.background=new THREE.Color(0x05070b);
 F.sky=new THREE.Mesh(new THREE.SphereGeometry(55,24,12),makeSkyMat());F.sky.material.fog=false;F.sky.renderOrder=-1;scene.add(F.sky);
 moon.position.set(-20,40,-30);moon.intensity=.5;
 // ground with gentle bumps off the trail
 const Z0=10,Z1=-150,GW=110;const gg=new THREE.PlaneGeometry(GW,Z0-Z1,55,80);gg.rotateX(-Math.PI/2);gg.translate(0,0,(Z0+Z1)/2);
 const gp=gg.attributes.position,guv=gg.attributes.uv;for(let i=0;i<gp.count;i++){const x=gp.getX(i),z=gp.getZ(i);const d=Math.abs(x-trailX(z));gp.setY(i,d>3?(Math.sin(x*.7)*Math.cos(z*.5)+hash2(x,z)*.6)*.12*Math.min(1,(d-3)/3):-.01);guv.setXY(i,x/3,z/3);}
 gg.computeVertexNormals();const ground=new THREE.Mesh(gg,F.groundMat);ground.receiveShadow=true;scene.add(ground);
 // trail ribbon with ragged edges
 const pos=[],uvs=[],idx=[];let row=0;for(let z=Z0-2;z>=-142;z-=.8,row++){const cx=trailX(z);const wl=1.7+hash2(z,1)*.5,wr=1.7+hash2(z,2)*.5;
  pos.push(cx-wl,.015,z,cx,.02,z,cx+wr,.015,z);uvs.push(-wl/2.5,z/2.5,0,z/2.5,wr/2.5,z/2.5);if(row){const a=(row-1)*3,b=row*3;idx.push(a,b,a+1,a+1,b,b+1,a+1,b+1,a+2,a+2,b+1,b+2);}}
 const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));tg.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));tg.setIndex(idx);tg.computeVertexNormals();
 const trail=new THREE.Mesh(tg,trailMat);trail.receiveShadow=true;scene.add(trail);
 // trees (instanced, 4 variants) + collision hash
 for(let v=0;v<4;v++)F.treeGeos.push(makeDeadTree(v+1));
 const per=[[],[],[],[]];F.hash=new Map();const key=(x,z)=>Math.floor(x/4)+','+Math.floor(z/4);
 let tries=0;while(tries++<4000&&per.flat().length<190){const z=Z1+5+Math.random()*(Z0-Z1-8),x=trailX(z)+(Math.random()-.5)*2*(4+Math.random()*36);
  const d=Math.abs(x-trailX(z));if(d<3.6)continue;if(z<-120&&Math.abs(x-trailX(-140))<14)continue;// clearing around house
  let ok=true;for(const t of F.trees)if((t.x-x)**2+(t.z-z)**2<4){ok=false;break;}if(!ok)continue;
  const sc=.8+Math.random()*.7;const v=Math.floor(Math.random()*4);const t={x,z,r:.35*sc,sc,v,hits:0};F.trees.push(t);const k=key(x,z);if(!F.hash.has(k))F.hash.set(k,[]);F.hash.get(k).push(t);
  per[v].push(t.M=new THREE.Matrix4().compose(new THREE.Vector3(x,0,z),new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random()-.5)*.12,Math.random()*6.28,(Math.random()-.5)*.12)),new THREE.Vector3(sc,sc*(.9+Math.random()*.4),sc)));}
 per.forEach((list,v)=>addChunked(F.treeGeos[v],barkMat,list,{shadow:true}));
 // fire-sticks along the trail
 F.stickObjs=[];for(let z=-2,k=0;z>-128;z-=9,k++){const side=k%2?1:-1;const x=trailX(z)+side*2.4;
  // each fire-stick is a group (stick + head + flame) so it can be pulled out of the ground and carried / thrown
  const grp=new THREE.Group();grp.position.set(x,0,z);grp.rotation.z=side*.06;const st=new THREE.Mesh(new THREE.CylinderGeometry(.035,.05,1.5,6),barkMat);st.position.y=.72;st.castShadow=true;grp.add(st);
  const f=makeFlame(1.15);f.position.set(0,1.62,0);grp.add(f);scene.add(grp);const spot=new THREE.Vector3(x,1.75,z);torchSpots.push(spot);F.stickObjs.push({grp,spot});(F.sticks=F.sticks||[]).push(new THREE.Vector3(x,1.42,z));}
 // pages on stumps beside the trail
 for(const z of [-16,-38,-61,-84,-106]){const side=hash2(z,5)>.5?1:-1;const x=trailX(z)+side*3;
  const stump=new THREE.Mesh(new THREE.CylinderGeometry(.32,.4,.7,10),barkMat);stump.position.set(x,.35,z);scene.add(stump);
  const p=new THREE.Mesh(new THREE.PlaneGeometry(0.22,0.3),pageMat);p.position.set(x,1.1,z);p.add(glow(0xffd890,.6));scene.add(p);pages.push(p);}
 // monsters + scares
 for(const z of [-30,-58,-92]){const s=hash2(z,9)>.5?1:-1;ghoulSpawns.push(new THREE.Vector3(trailX(z)+s*9,0,z));}
 F.wraithSpawns.push(new THREE.Vector3(trailX(-75)-12,0,-75));
 for(const z of [-24,-50,-72,-112])F.scares.push({x:trailX(z),z,done:false});
 start.set(trailX(4),0,4);
 // collision for player/enemies
 solid=(x,z)=>{if(z>Z0-1||z<Z1+2)return true;if(Math.abs(x-trailX(z))>40)return true;
  if(F.house&&x>F.house.min.x&&x<F.house.max.x&&z>F.house.min.z&&z<F.house.max.z)return true;
  const kx=Math.floor(x/4),kz=Math.floor(z/4);for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const l=F.hash.get((kx+a)+','+(kz+b));if(l)for(const t of l)if((t.x-x)**2+(t.z-z)**2<t.r*t.r)return true;}return false;};
}
// Spatial chunking (20 m along the trail) so frustum + fog-distance culling work on instanced vegetation
function addChunked(geo,mat,list,{shadow=false,receive=true}={}){const groups=new Map();for(const M of list){const z=M.elements[14];const k=Math.floor(z/30);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(M);}
 for(const [k,arr] of groups){const im=new THREE.InstancedMesh(geo,mat,arr.length);arr.forEach((M,i)=>{im.setMatrixAt(i,M);M._ref={im,i};});im.computeBoundingSphere();im.castShadow=shadow;im.receiveShadow=receive;scene.add(im);(F.chunks=F.chunks||[]).push({im,z:k*30+15});}}
function placeInstanced(g,mats,{shadow=false,strip=false}={}){g.scene.updateMatrixWorld(true);const meshes=[];g.scene.traverse(o=>o.isMesh&&meshes.push(o));
 meshes.forEach((m,mi)=>{const list=mats(mi,meshes.length);if(!list.length)return;const base=m.matrixWorld.clone();if(strip)base.setPosition(0,0,0);addChunked(m.geometry,m.material,list.map(M=>M.clone().multiply(base)),{shadow});});}
function randOffTrail(minD,maxD,z0=-140,z1=6){for(let i=0;i<50;i++){const z=z0+Math.random()*(z1-z0),side=Math.random()<.5?-1:1,x=trailX(z)+side*(minD+Math.random()*(maxD-minD));if(!solid(x,z))return [x,z];}return [trailX(0)+6,0];}
const _M=(x,y,z,ry,s,rx=0)=>new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,0)),new THREE.Vector3(s,s,s));
async function loadForestModels(){const [logs,logs2,fern,grass,rocks,torchM,house,estoc]=await Promise.all(['dead_tree_trunk','dead_tree_trunk_02','fern_02','grass_medium_01','rock_moss_set_01','torch_stick','house','antique_estoc'].map(n=>loadG(`assets/models/${n}.glb`)));
 // fallen logs
 for(const [g,n] of [[logs,10],[logs2,8]])placeInstanced(g,()=>Array.from({length:n},()=>{const [x,z]=randOffTrail(3.5,25);return _M(x,0,z,Math.random()*6.28,.9+Math.random()*.4);}),{shadow:true});
 // ferns & grass: dense near the trail edges
 placeInstanced(fern,(mi,n)=>mi>1?[]:Array.from({length:90},()=>{const [x,z]=randOffTrail(2.3,14);return _M(x,0,z,Math.random()*6.28,1.2+Math.random()*1.3);}),{strip:true});
 placeInstanced(grass,(mi,n)=>(mi!==3&&mi!==4)?[]:Array.from({length:140},()=>{const [x,z]=randOffTrail(1.9,9);return _M(x,0,z,Math.random()*6.28,4+Math.random()*4);}),{strip:true});
 // mossy rocks
 placeInstanced(rocks,(mi,n)=>mi>2?[]:Array.from({length:12},()=>{const [x,z]=randOffTrail(3,22);return _M(x,-.1,z,Math.random()*6.28,.5+Math.random()*.9);}),{strip:true,shadow:true});
 // torch heads on the fire-sticks
 {const b=new THREE.Box3().setFromObject(torchM.scene);const h=b.max.y-b.min.y;const s=.42/h;for(const so of F.stickObjs){const c=torchM.scene.clone(true);c.scale.multiplyScalar(s);c.position.y=1.42-b.min.y*s;so.grp.add(c);}}
 buildGrabbables();
 // the old house (CC0 Town House), weathered & darkened, facing the trail
 {const hs=house.scene;const b=new THREE.Box3().setFromObject(hs);const w=b.max.x-b.min.x;const s=17/w;hs.scale.multiplyScalar(s);
  const hx=trailX(-140);hs.position.set(hx,0,-140);hs.updateMatrixWorld(true);const b2=new THREE.Box3().setFromObject(hs);hs.position.y-=b2.min.y;hs.position.z-=b2.max.z-(-132);hs.updateMatrixWorld(true);
  hs.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;const m=o.material;m.color.multiplyScalar(.55);m.roughness=.95;m.metalness=0;
   if(/beige|white|lightyellow/i.test(m.name)){m.map=woodMat.map;m.normalMap=woodMat.normalMap;m.roughnessMap=woodMat.roughnessMap;}
   if(/grey|darkgrey/i.test(m.name)){m.map=wallMat.map;m.normalMap=wallMat.normalMap;}}});
  scene.add(hs);F.house=new THREE.Box3().setFromObject(hs);F.house.min.x+=.3;F.house.max.x-=.3;F.door=new THREE.Vector3(hx,0,F.house.max.z+.9);
  const win=new THREE.PointLight(0xffa860,6,14,2);win.position.set(hx,2.2,F.house.max.z+1.2);scene.add(win);const g2=glow(0xffb070,2.2);g2.position.set(hx+3,3.2,F.house.max.z+.05);scene.add(g2);
  const g3=glow(0xffb070,1.6);g3.position.set(hx-4,6.5,F.house.max.z+.05);scene.add(g3);}
 // realistic longsword-class blade: Poly Haven "Antique Estoc" replaces the procedural sword (grip at the controller grip origin, blade along -Z)
 {const m=estoc.scene;m.updateMatrixWorld(true);const pts=[];m.traverse(o=>{if(o.isMesh){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i+=3)pts.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));o.castShadow=false;}});
  const bb=new THREE.Box3().setFromPoints(pts),sz=bb.getSize(new THREE.Vector3());const ax=sz.x>sz.y&&sz.x>sz.z?'x':sz.y>sz.z?'y':'z';
  // which end is the hilt? the end with the wider cross-section (crossguard)
  const lo=bb.min[ax],hi=bb.max[ax],L=hi-lo;const spread=(a0,a1)=>{const q=pts.filter(p=>p[ax]>=a0&&p[ax]<=a1);const b=new THREE.Box3().setFromPoints(q).getSize(new THREE.Vector3());b[ax]=0;return b.length();};
  const hiltHigh=spread(hi-L*.25,hi)>spread(lo,lo+L*.25);const dir=new THREE.Vector3();dir[ax]=hiltHigh?-1:1; // hilt->tip direction
  const piv=new THREE.Group();piv.add(m);piv.quaternion.setFromUnitVectors(dir,new THREE.Vector3(0,0,-1));const s=1.12/L;piv.scale.setScalar(s);
  // grip point: ~8% of length in from the hilt end
  const hiltEnd=bb.getCenter(new THREE.Vector3());hiltEnd[ax]=hiltHigh?hi-L*.08:lo+L*.08;const gripP=hiltEnd.applyQuaternion(piv.quaternion).multiplyScalar(s);piv.position.copy(gripP).negate();
  while(sword.children.length)sword.remove(sword.children[0]);sword.add(piv);tipLocal.set(0,0,-L*.92*s);window.__swordInfo={ax,hiltHigh,L};}
}

// =================== UI: loading screen, title / pause / save / load / settings, VR laser pointers, perf overlay ===================
var UI;
function initUI(){
 const cv=document.createElement('canvas');cv.width=1024;cv.height=768;const ctx=cv.getContext('2d');
 const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
 const panel=new THREE.Mesh(new THREE.PlaneGeometry(1.6,1.2),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthTest:false,fog:false,toneMapped:false}));panel.renderOrder=3000;panel.visible=false;rig.add(panel);
 const dom=document.createElement('div');dom.id='ui';dom.style.cssText='position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.35);z-index:10;padding-bottom:64px;box-sizing:border-box';cv.style.cssText='width:min(94vw,calc((100vh - 80px)*1.333));max-width:1024px;cursor:pointer;';dom.appendChild(cv);document.body.appendChild(dom);
 document.getElementById('start')?.remove();
 UI={mode:'loading',cv,ctx,tex,panel,dom,items:[],hover:-1,progress:0,tab:0,drag:null,needsRestart:false,confirm:null,toast:'',toastT:0,lastMode:null,perf:null};
 THREE.DefaultLoadingManager.onProgress=(u,l,t)=>{UI.progress=Math.max(UI.progress,l/Math.max(1,t));if(UI.mode==='loading')drawUI();};
 // desktop mouse
 const toPx=e=>{const r=cv.getBoundingClientRect();return [(e.clientX-r.left)/r.width*1024,(e.clientY-r.top)/r.height*768];};
 cv.addEventListener('mousemove',e=>{const [x,y]=toPx(e);uiHover(x,y);if(UI.drag)uiDrag(x);});
 cv.addEventListener('mousedown',e=>{const [x,y]=toPx(e);uiHover(x,y);uiPress(x,y);});
 addEventListener('mouseup',()=>UI.drag=null);
 // VR lasers
 const lg=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-1)]);
 UI.lasers=[c0,c1].map(c=>{const l=new THREE.Line(lg,new THREE.LineBasicMaterial({color:0xffc070,transparent:true,opacity:.8,fog:false}));l.scale.z=4;l.visible=false;c.add(l);
  const dot=new THREE.Mesh(new THREE.SphereGeometry(.008,8,6),new THREE.MeshBasicMaterial({color:0xffe0a0,fog:false,depthTest:false}));dot.renderOrder=3001;dot.visible=false;rig.add(dot);
  c.addEventListener('selectstart',()=>{if(!UI.mode||UI.mode==='loading')return;const h=laserHit(c);if(h){uiHover(h.x,h.y);uiPress(h.x,h.y);UI.dragC=c;}});
  c.addEventListener('selectend',()=>{UI.drag=null;UI.dragC=null;});return {c,l,dot};});
 // perf overlay
 const pc=document.createElement('canvas');pc.width=512;pc.height=300;const pctx=pc.getContext('2d');const ptex=new THREE.CanvasTexture(pc);ptex.colorSpace=THREE.SRGBColorSpace;
 const pmesh=new THREE.Mesh(new THREE.PlaneGeometry(.34,.2),new THREE.MeshBasicMaterial({map:ptex,transparent:true,depthTest:false,fog:false,toneMapped:false}));pmesh.position.set(-.32,-.22,-.8);pmesh.renderOrder=3002;pmesh.visible=false;camera.add(pmesh);
 pc.style.cssText='position:fixed;top:30px;right:8px;width:340px;pointer-events:none;display:none;z-index:9';document.body.appendChild(pc);
 const gl=renderer.getContext();const tq=gl.getExtension('EXT_disjoint_timer_query_webgl2');
 UI.perf={pc,pctx,ptex,pmesh,gl,tq,q:null,pending:[],gpu:0,frames:[],cpu:[],t:0};
 // comfort vignette (VR locomotion)
 const vc=document.createElement('canvas');vc.width=vc.height=256;{const g=vc.getContext('2d');const gr=g.createRadialGradient(128,128,40,128,128,128);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(.55,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(0,0,0,1)');g.fillStyle=gr;g.fillRect(0,0,256,256);}
 UI.vig=new THREE.Mesh(new THREE.PlaneGeometry(1.1,1.1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(vc),transparent:true,opacity:0,depthTest:false,fog:false,toneMapped:false}));UI.vig.position.z=-.3;UI.vig.renderOrder=2500;camera.add(UI.vig);
 drawUI();showUI();
}
function updateVignette(xr,mv,dt){const want=(xr&&SET.vignette)?Math.min(1,Math.max(mv,turning))*.85:0;turning=0;UI.vig.material.opacity+=(want-UI.vig.material.opacity)*Math.min(1,dt*8);UI.vig.visible=UI.vig.material.opacity>.01;}
function laserHit(c){const rc=new THREE.Raycaster();const m=c.matrixWorld;rc.ray.origin.setFromMatrixPosition(m);rc.ray.direction.set(0,0,-1).transformDirection(m);const h=rc.intersectObject(UI.panel)[0];if(!h)return null;return {x:h.uv.x*1024,y:(1-h.uv.y)*768,p:h.point,d:h.distance};}
function showUI(){const xr=renderer.xr.isPresenting;const on=!!UI.mode;UI.dom.style.display=on&&!xr?'flex':'none';UI.panel.visible=on&&xr;
 if(on&&xr){camera.updateMatrixWorld(true);const hp=camera.getWorldPosition(new THREE.Vector3()),f=new THREE.Vector3();camera.getWorldDirection(f);f.y=0;f.normalize();
  const wp=hp.clone().addScaledVector(f,1.5);wp.y=hp.y-.1;rig.worldToLocal(wp);UI.panel.position.copy(wp);const lookW=hp.clone();rig.worldToLocal(lookW);lookW.y=wp.y;UI.panel.lookAt(rig.localToWorld(lookW.clone()));}
 if(on&&!xr&&document.pointerLockElement)document.exitPointerLock();}
function openMenu(m){if(UI.mode===m)return;UI.lastMode=UI.mode;UI.mode=m;UI.hover=-1;UI.confirm=null;drawUI();showUI();}
function closeMenu(){UI.mode=null;showUI();clock.getDelta();}
function togglePause(){if(UI.mode==='pause'){resumeGame();return;}if(UI.mode)return;if(CS.state==='idle')return;openMenu('pause');}
function resumeGame(){closeMenu();if(!renderer.xr.isPresenting)renderer.domElement.requestPointerLock?.();}
function toast(t){UI.toast=t;UI.toastT=2.5;drawUI();}
// ----- menu button / pause fallbacks (polled each frame) -----
let yHold=0,menuPrev=false;
function updateUI(dt,xr){
 const ls=leftSrc?.gamepad;
 if(xr&&ls){const b=ls.buttons;let menu=false;for(let i=6;i<b.length;i++)if(b[i]?.pressed)menu=true; // xr-standard index 12 / any extra index = menu if exposed
  if(menu&&!menuPrev)togglePause();menuPrev=menu;
  if(b[5]?.pressed){yHold+=dt;if(yHold>.8&&yHold<10){yHold=99;togglePause();}}else yHold=0;} // fallback: long-press Y
 if(xr&&UI.mode){for(const L of UI.lasers){const h=L.c.userData.src||srcs.some(s=>s)?laserHit(L.c):null;L.l.visible=true;L.dot.visible=!!h;if(h){L.l.scale.z=h.d;L.dot.position.copy(rig.worldToLocal(h.p.clone()));uiHover(h.x,h.y);if(UI.drag&&UI.dragC===L.c)uiDrag(h.x);}else L.l.scale.z=4;}}
 else for(const L of UI.lasers){L.l.visible=false;L.dot.visible=false;}
 if(UI.toastT>0){UI.toastT-=dt;if(UI.toastT<=0){UI.toast='';if(UI.mode)drawUI();}}
 if(UI.mode==='loading'&&frame%10===0)drawUI();
 perfTick(dt,xr);}
// ----- drawing -----
const PANEL_BG=(g)=>{g.clearRect(0,0,1024,768);const gr=g.createRadialGradient(512,384,100,512,384,640);gr.addColorStop(0,'rgba(18,14,12,.94)');gr.addColorStop(1,'rgba(4,2,2,.97)');g.fillStyle=gr;g.fillRect(0,0,1024,768);
 g.strokeStyle='rgba(150,40,30,.7)';g.lineWidth=4;g.strokeRect(10,10,1004,748);g.strokeStyle='rgba(220,190,140,.25)';g.lineWidth=1;g.strokeRect(22,22,980,724);};
function title(g,t,sub){g.textAlign='center';g.fillStyle='#c9b48a';g.font='bold 54px Georgia,serif';g.shadowColor='#900';g.shadowBlur=18;g.fillText(t,512,92);g.shadowBlur=0;if(sub){g.font='italic 22px Georgia,serif';g.fillStyle='#8a7a66';g.fillText(sub,512,126);}}
function btn(label,x,y,w,h,fn,extra={}){UI.items.push({kind:'btn',label,x,y,w,h,fn,...extra});}
function fmtDate(t){const d=new Date(t);return d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});}
const SETTINGS=[
 ['Audio',[['master','Master volume','slider',0,1],['music','Music volume','slider',0,1],['sfx','SFX volume','slider',0,1],['ambient','Ambient volume','slider',0,1]]],
 ['Graphics',[['preset','Quality preset','choice',['Low','Medium','High','Ultra']],['aa','Anti-aliasing','choice',['Off','MSAA 2x','MSAA 4x']],['shadows','Shadow quality','choice',['Off','Low','High']],['texq','Texture quality','choice',['Low','Medium','High']],
   ['renderScale','Render scale (desktop)','slider',.5,1.5],['fog','Fog density','slider',.4,1.6],['brightness','Brightness','slider',.5,1.8],['fov','Field of view (desktop)','slider',55,100],['perf','Performance overlay','toggle']]],
 ['VR & Comfort',[['vrScale','VR framebuffer scale','slider',.5,1.2],['foveation','Fixed foveation','slider',0,1],['refresh','Target refresh rate','choice',[72,90,120]],['turnMode','Turning','choice',['Snap','Smooth']],['snapAngle','Snap turn angle','choice',[15,30,45,60]],
   ['turnSpeed','Smooth turn speed','slider',30,240],['vignette','Comfort vignette','toggle'],['armSwing','Arm-swing running','toggle'],['armSens','Arm-swing sensitivity','slider',.5,2],['leftHanded','Left-handed mode','toggle']]],
 ['Controls',[['physics','Real Life Physics System','toggle'],['sprintMode','Sprint','choice',['Hold','Toggle']],['subtitles','Subtitles','toggle'],['haptics','Haptics','toggle'],['mouseSens','Mouse sensitivity','slider',.2,3],['invertY','Invert Y','toggle']]]];
SET_DEF.perf=false;if(SET.perf===undefined)SET.perf=false;
function drawUI(){const g=UI.ctx;UI.items=[];PANEL_BG(g);const m=UI.mode;g.textAlign='center';
 if(m==='loading'){title(g,'THE HOLLOW KEEP','Alden Kael');const p=UI.progress;g.fillStyle='#8a7a66';g.font='24px Georgia,serif';g.fillText(['The forest stirs...','Something watches from the trees...','Lighting the fire-sticks...','Gathering the pages of the past...'][Math.floor(Date.now()/2500)%4],512,420);
  g.strokeStyle='#5a1a14';g.lineWidth=3;g.strokeRect(212,460,600,28);const gr=g.createLinearGradient(212,0,812,0);gr.addColorStop(0,'#4a0d08');gr.addColorStop(1,'#c2401c');g.fillStyle=gr;g.fillRect(215,463,594*p,22);
  g.fillStyle='#c9b48a';g.font='20px Georgia,serif';g.fillText(`Loading ${Math.round(p*100)}%`,512,530);}
 else if(m==='title'){title(g,'THE HOLLOW KEEP','a tale of Alden Kael');const has=listSlots().some(Boolean);let y=230;
  btn('New Game',362,y,300,64,()=>{newGame();});y+=84;if(has){btn('Continue',362,y,300,64,()=>{const s=listSlots().map((d,i)=>d&&{...d,i}).filter(Boolean).sort((a,b)=>b.t-a.t)[0];loadSlot(s.i);});y+=84;}
  btn('Load Game',362,y,300,64,()=>openMenu('load'),{disabled:!has});y+=84;btn('Settings',362,y,300,64,()=>openMenu('settings'));
  g.font='18px Georgia,serif';g.fillStyle='#6a5a4a';g.fillText(renderer.xr.isPresenting?'Point with a controller and pull the trigger':'Desktop: mouse to select · Quest: ENTER VR, then point & pull trigger',512,700);}
 else if(m==='pause'){title(g,'PAUSED');let y=210;for(const [l,f] of [['Continue',resumeGame],['Save Game',()=>openMenu('save')],['Settings',()=>openMenu('settings')],['Quit Game',quitGame]]){btn(l,362,y,300,66,f);y+=90;}
  g.font='18px Georgia,serif';g.fillStyle='#6a5a4a';g.fillText('Quest: menu button (if exposed) or hold Y · Desktop: Esc',512,700);}
 else if(m==='save'||m==='load'){title(g,m==='save'?'SAVE GAME':'LOAD GAME');const sl=listSlots();
  sl.forEach((d,i)=>{const y=150+i*102;UI.items.push({kind:'slot',i,d,x:112,y,w:800,h:88,fn:()=>{if(m==='save'){if(d&&UI.confirm!==i){UI.confirm=i;drawUI();return;}saveSlot(i);UI.confirm=null;toast(`Saved to slot ${i+1}`);}else if(d)loadSlot(i);}});});
  btn('Back',412,676,200,56,()=>openMenu(UI.lastMode==='title'||m==='load'?'title_or_pause':'pause'));}
 else if(m==='settings'){title(g,'SETTINGS');SETTINGS.forEach(([n],i)=>UI.items.push({kind:'tab',label:n,i,x:62+i*228,y:140,w:216,h:46,fn:()=>{UI.tab=i;drawUI();}}));
  SETTINGS[UI.tab][1].forEach(([k,label,type,a,b],r)=>{UI.items.push({kind:type,k,label,a,b,x:80,y:210+r*50,w:864,h:44});});
  btn('Back',412,690,200,52,()=>{saveSettings();openMenu(CS.state==='idle'&&!window.__inGame?'title':'pause');});
  if(UI.needsRestart)btn('Apply & Restart',650,690,290,52,applyRestart,{accent:true});}
 // draw items
 UI.items.forEach((it,idx)=>{const hv=idx===UI.hover;g.textAlign='left';
  if(it.kind==='btn'||it.kind==='tab'){const act=it.kind==='tab'&&it.i===UI.tab;g.fillStyle=it.disabled?'rgba(40,30,25,.5)':hv?'rgba(120,30,20,.9)':act?'rgba(90,25,18,.9)':it.accent?'rgba(110,60,10,.85)':'rgba(40,22,18,.85)';g.fillRect(it.x,it.y,it.w,it.h);g.strokeStyle=hv?'#e8b070':'#6a3a2a';g.lineWidth=2;g.strokeRect(it.x,it.y,it.w,it.h);
   g.fillStyle=it.disabled?'#5a4a3a':'#e8d8b0';g.font=(it.kind==='tab'?'22px':'30px')+' Georgia,serif';g.textAlign='center';g.fillText(it.label,it.x+it.w/2,it.y+it.h/2+10);}
  else if(it.kind==='slot'){g.fillStyle=hv?'rgba(110,30,20,.85)':'rgba(35,20,16,.85)';g.fillRect(it.x,it.y,it.w,it.h);g.strokeStyle=UI.confirm===it.i?'#ffcc66':'#6a3a2a';g.lineWidth=2;g.strokeRect(it.x,it.y,it.w,it.h);
   g.fillStyle='#c9b48a';g.font='bold 30px Georgia,serif';g.fillText(`${it.i+1}`,it.x+24,it.y+56);g.font='22px Georgia,serif';
   if(it.d){g.fillStyle='#e8d8b0';g.fillText(`${it.d.area==='forest'?'Dark Forest Trail':it.d.area}  ·  ${Math.round(it.d.progress*100)}% to the house`,it.x+80,it.y+36);g.fillStyle='#a89878';g.fillText(`${fmtDate(it.d.t)}   Pages ${it.d.pages.length}/${PAGES_NEEDED}   HP ${it.d.hp}/${ALDEN.maxHp}   Potions ${it.d.potions}`,it.x+80,it.y+68);
    if(UI.confirm===it.i){g.fillStyle='#ffcc66';g.textAlign='right';g.fillText('Click again to overwrite',it.x+it.w-20,it.y+36);}}
   else{g.fillStyle='#6a5a4a';g.fillText(UI.mode==='save'?'— Empty slot — click to save —':'— Empty —',it.x+80,it.y+52);}}
  else{// settings rows
   g.fillStyle=hv?'rgba(70,24,18,.7)':'rgba(30,18,14,.6)';g.fillRect(it.x,it.y,it.w,it.h);g.fillStyle='#e8d8b0';g.font='24px Georgia,serif';g.fillText(it.label,it.x+16,it.y+30);const v=SET[it.k];const cx=it.x+470,cw=370;
   if(it.kind==='slider'){const k=(v-it.a)/(it.b-it.a);g.fillStyle='#3a1a14';g.fillRect(cx,it.y+18,cw,8);g.fillStyle='#c2401c';g.fillRect(cx,it.y+18,cw*k,8);g.beginPath();g.arc(cx+cw*k,it.y+22,11,0,7);g.fillStyle='#e8c890';g.fill();g.fillStyle='#a89878';g.textAlign='right';g.font='20px Georgia,serif';g.fillText(it.b>10?Math.round(v):(+v).toFixed(2),it.x+it.w-6,it.y+30);}
   else if(it.kind==='choice'){g.textAlign='center';g.fillStyle='#c2401c';g.font='28px Georgia,serif';g.fillText('◀',cx+20,it.y+32);g.fillText('▶',cx+cw-20,it.y+32);g.fillStyle='#e8d8b0';g.font='24px Georgia,serif';g.fillText(String(v)+(it.k==='refresh'?' Hz':it.k==='snapAngle'?'°':''),cx+cw/2,it.y+30);}
   else{g.textAlign='center';g.fillStyle=v?'#7a2a1a':'#2a1a14';g.fillRect(cx+cw-90,it.y+8,80,28);g.fillStyle='#e8d8b0';g.font='20px Georgia,serif';g.fillText(v?'ON':'OFF',cx+cw-50,it.y+29);}}});
 if(UI.toast){g.textAlign='center';g.fillStyle='#ffcc66';g.font='24px Georgia,serif';g.fillText(UI.toast,512,660);}
 UI.tex.needsUpdate=true;}
function uiHover(x,y){const i=UI.items.findIndex(it=>x>=it.x&&x<=it.x+it.w&&y>=it.y&&y<=it.y+it.h);if(i!==UI.hover){UI.hover=i;drawUI();}}
function uiPress(x,y){const it=UI.items[UI.hover];if(!it||it.disabled)return;sfx?.swing?.();
 if(it.fn){if(it.label==='Back'&&UI.mode!=='settings'){openMenu(window.__inGame?'pause':'title');return;}it.fn();return;}
 const cx=it.x+470,cw=370;
 if(it.kind==='slider'){UI.drag=it;uiDrag(x);}
 else if(it.kind==='choice'){const opts=SETTINGS.flatMap(t=>t[1]).find(r=>r[0]===it.k)[3];let i=opts.indexOf(SET[it.k]);i=(i+(x<cx+cw/2?-1:1)+opts.length)%opts.length;setSetting(it.k,opts[i]);}
 else if(it.kind==='toggle')setSetting(it.k,!SET[it.k]);}
function uiDrag(x){const it=UI.drag;if(!it)return;const cx=it.x+470,cw=370;let k=Math.max(0,Math.min(1,(x-cx)/cw));let v=it.a+(it.b-it.a)*k;if(it.b>10)v=Math.round(v);else v=Math.round(v*100)/100;setSetting(it.k,v);}
const PRESETS={Low:{aa:'Off',shadows:'Off',texq:'Low',renderScale:.75,vrScale:.75,foveation:1},Medium:{aa:'MSAA 2x',shadows:'Low',texq:'Medium',renderScale:.9,vrScale:.85,foveation:1},High:{aa:'MSAA 4x',shadows:'Low',texq:'High',renderScale:1,vrScale:.9,foveation:.75},Ultra:{aa:'MSAA 4x',shadows:'High',texq:'High',renderScale:1.25,vrScale:1.1,foveation:.5}};
const BOOT_AA=SET.aa;
function setSetting(k,v){SET[k]=v;if(k==='preset')Object.assign(SET,PRESETS[v]);UI.needsRestart=(SET.aa==='Off')!==(BOOT_AA==='Off');saveSettings();applySettings();drawUI();}
function applyAudio(){if(!AC)return;const t=AC.currentTime;master.gain.setTargetAtTime(.75*SET.master,t,.05);musicBus.gain.setTargetAtTime(SET.music,t,.05);sfxBus.gain.setTargetAtTime(SET.sfx,t,.05);ambBus.gain.setTargetAtTime(SET.ambient,t,.05);}
let _shadowSize=0;
function applySettings(){applyAudio();const xr=renderer.xr.isPresenting;
 renderer.toneMappingExposure=1.15*SET.brightness;if(scene.fog)scene.fog.density=.055*SET.fog;
 if(!xr){camera.fov=SET.fov;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)*SET.renderScale);}
 torch.castShadow=SET.shadows!=='Off';const sz=SET.shadows==='High'?512:256;if(sz!==_shadowSize){_shadowSize=sz;torch.shadow.mapSize.set(sz,sz);if(torch.shadow.map){torch.shadow.map.dispose();torch.shadow.map=null;}}
 const an=SET.texq==='Low'?1:SET.texq==='Medium'?2:Math.min(8,renderer.capabilities.getMaxAnisotropy());const seen=new Set();
 scene.traverse(o=>{const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];for(const m of ms)for(const key of ['map','normalMap','roughnessMap']){const t=m[key];if(t&&!seen.has(t)&&t.isTexture&&!t.isCanvasTexture){seen.add(t);if(t.anisotropy!==an){t.anisotropy=an;t.needsUpdate=true;}}}});
 renderer.xr.setFoveation?.(SET.foveation);
 const ses=renderer.xr.getSession?.();if(ses?.updateTargetFrameRate&&ses.supportedFrameRates){const r=[...ses.supportedFrameRates].filter(f=>f<=SET.refresh).sort((a,b)=>b-a)[0]||ses.supportedFrameRates[0];if(ses.frameRate!==r)ses.updateTargetFrameRate(r).catch(()=>{});}
 if(!xr&&!SET.vignette){} document.getElementById('vig').style.display=xr?'none':'';
 UI.perf.pc.style.display=SET.perf&&!xr?'block':'none';UI.perf.pmesh.visible=SET.perf&&xr;}
function applyRestart(){sessionStorage.setItem('hk_resume',JSON.stringify(window.__inGame?snapshot():{title:true}));renderer.xr.getSession?.()?.end().catch(()=>{});setTimeout(()=>location.reload(),150);}
// ----- saves -----
const SLOT_KEY=i=>'hk_slot_'+i;
function listSlots(){return [0,1,2,3,4].map(i=>{try{return JSON.parse(localStorage.getItem(SLOT_KEY(i)));}catch(e){return null;}});}
function snapshot(){camera.getWorldPosition(headW);return {v:1,t:Date.now(),area:'forest',pos:[rig.position.x,rig.position.z],rigYaw:rig.rotation.y,yaw,pitch,hp:P.hp,potions:P.potions,
 pages:pages.map((p,i)=>p.visible?-1:i).filter(i=>i>=0),journal:P.pages,sword:swordHand,scares:scares.map(s=>s.done),progress:Math.max(0,Math.min(1,(4-headW.z)/135)),
 enemies:enemies.map(e=>({type:e.type,dead:!!e.dead,x:e.mesh.position.x,z:e.mesh.position.z,hp:e.hp,state:e.state}))};}
function saveSlot(i){localStorage.setItem(SLOT_KEY(i),JSON.stringify(snapshot()));}
function applySnapshot(d){CS.state='done';fadeSphere.visible=false;if(rig.parent!==scene){rig.parent?.remove(rig);scene.add(rig);}camera.far=60;camera.updateProjectionMatrix();
 rig.position.set(d.pos[0],0,d.pos[1]);rig.rotation.set(0,d.rigYaw||0,0);yaw=d.yaw||0;pitch=d.pitch||0;P.hp=d.hp;P.potions=d.potions;P.pages=d.journal;P.dead=false;P.won=false;
 pages.forEach((p,i)=>p.visible=!d.pages.includes(i));d.scares.forEach((v,i)=>scares[i]&&(scares[i].done=v));
 while(enemies.length<d.enemies.length&&zombieG)spawn(d.enemies[enemies.length].type,new THREE.Vector3());
 d.enemies.forEach((s,i)=>{const e=enemies[i];if(!e)return;e.mesh.position.set(s.x,0,s.z);e.hp=s.hp;e.state=s.state||'wander';if(s.dead){e.dead=true;e.deadT=0;scene.remove(e.mesh);scene.remove(e.eyes);}});
 if(d.sword>=0)draw(renderer.xr.isPresenting?d.sword:1);else if(swordHand>=0)sheathe();drawHud();window.__inGame=true;}
function loadSlot(i){const d=listSlots()[i];if(!d)return;applySnapshot(d);closeMenu();if(!renderer.xr.isPresenting)renderer.domElement.requestPointerLock?.();say(`Loaded slot ${i+1}.`,2);}
function newGame(){window.__inGame=true;closeMenu();audioStart();startCutscene();if(!renderer.xr.isPresenting)renderer.domElement.requestPointerLock?.();}
function quitGame(){const s=renderer.xr.getSession?.();if(s)s.end().catch(()=>{});sessionStorage.setItem('hk_resume',JSON.stringify({title:true}));setTimeout(()=>location.reload(),200);}
function onAssetsReady(){applySettings();const r=sessionStorage.getItem('hk_resume');sessionStorage.removeItem('hk_resume');
 if(r){const d=JSON.parse(r);if(!d.title){applySnapshot(d);closeMenu();audioStart();say('Settings applied.',2);return;}}openMenu('title');}
function onXRStart(){const s=renderer.xr.getSession();applySettings();s.addEventListener('visibilitychange',()=>{if(s.visibilityState!=='visible'&&!UI.mode&&CS.state!=='idle')openMenu('pause');});
 setTimeout(()=>{showUI();if(UI.mode==='pause'||UI.mode==='title')drawUI();},100);}
addEventListener('blur',()=>{if(!UI.mode&&!renderer.xr.isPresenting&&window.__inGame&&CS.state==='done')openMenu('pause');});
renderer.xr.addEventListener('sessionend',()=>{applySettings();showUI();});
// ----- performance overlay -----
function perfTick(dt,xr){const P_=UI.perf;P_.frames.push(dt*1000);if(P_.frames.length>90)P_.frames.shift();
 // GPU timer query results (async)
 if(P_.tq){const gl=P_.gl;while(P_.pending.length){const q=P_.pending[0];if(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))break;if(!gl.getParameter(P_.tq.GPU_DISJOINT_EXT))P_.gpu=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(q);P_.pending.shift();}}
 if(!SET.perf)return;P_.t+=dt;if(P_.t<.25)return;P_.t=0;const f=P_.frames,avg=f.reduce((a,b)=>a+b,0)/f.length,mx=Math.max(...f);const cpu=P_.cpu.length?P_.cpu.reduce((a,b)=>a+b,0)/P_.cpu.length:0;
 const inf=renderer.info,ses=renderer.xr.getSession?.();const mem=performance.memory?(performance.memory.usedJSHeapSize/1048576).toFixed(0)+' MB':'n/a';
 const lines=[`FPS ${(1000/avg).toFixed(1)}   frame ${avg.toFixed(1)} ms (max ${mx.toFixed(1)})`,`CPU/JS ${cpu.toFixed(2)} ms   GPU ${P_.tq?P_.gpu.toFixed(2)+' ms':'n/a (no timer ext)'}`,
  `Draw calls ${inf.render.calls}   Tris ${(inf.render.triangles/1000).toFixed(1)}k`,`Textures ${inf.memory.textures}   Geometries ${inf.memory.geometries}   Programs ${inf.programs?.length??'?'}`,
  `JS heap ${mem}`,xr?`XR fb scale ${SET.vrScale}   refresh ${ses?.frameRate??'?'} Hz   fov ${SET.foveation}`:`Pixel ratio ${renderer.getPixelRatio().toFixed(2)}   ${innerWidth}x${innerHeight}`,
  `Est. latency ~${(avg+cpu+(P_.gpu||0)+(xr?avg:0)).toFixed(1)} ms (frame+CPU+GPU${xr?'+compositor':''})`];
 const g=P_.pctx;g.clearRect(0,0,512,300);g.fillStyle='rgba(0,0,0,.72)';g.fillRect(0,0,512,40+lines.length*34);g.fillStyle=avg>14.5?'#ff7060':'#80ff90';g.font='bold 24px monospace';g.fillText('PERF',12,30);g.fillStyle='#e0e0e0';g.font='20px monospace';lines.forEach((l,i)=>g.fillText(l,12,64+i*34));P_.ptex.needsUpdate=true;}
initUI();
// wrap the animation loop for CPU + GPU timing
renderer.setAnimationLoop((ts,xf)=>{const P_=UI.perf,gl=P_.gl;let q=null;if(P_.tq&&SET.perf&&P_.pending.length<4){q=gl.createQuery();gl.beginQuery(P_.tq.TIME_ELAPSED_EXT,q);}
 const t0=performance.now();tick();P_.cpu.push(performance.now()-t0);if(P_.cpu.length>60)P_.cpu.shift();if(q){gl.endQuery(P_.tq.TIME_ELAPSED_EXT);P_.pending.push(q);}});
window.__ui={stats:()=>{const f=UI.perf.frames,c=UI.perf.cpu;return {calls:renderer.info.render.calls,tris:renderer.info.render.triangles,tex:renderer.info.memory.textures,geo:renderer.info.memory.geometries,frameMs:+(f.reduce((a,b)=>a+b,0)/f.length).toFixed(1),cpuMs:+(c.reduce((a,b)=>a+b,0)/c.length).toFixed(2),gpuMs:+UI.perf.gpu.toFixed(2)}},open:openMenu,mode:()=>UI.mode,press:(label)=>{const i=UI.items.findIndex(it=>it.label===label);if(i<0)return false;UI.hover=i;const it=UI.items[i];uiPress(it.x+it.w-30,it.y+it.h/2);return true;},set:setSetting,SET,slots:listSlots};

// =================== Arm-swing running (VR) ===================
// Both hands swinging out of phase (vertical/forward velocity anti-correlated) with mean hand speed above ~1.2 m/s
// over the last 0.5 s => run. Hysteresis via a smoothed score (enter > .6, exit < .3). Sword attacks (one hand much
// faster than the other) don't count.
var runningNow=false;const AS={buf:[],prev:[null,null],score:0,on:false};
function armSwingRun(dt){if(!gripObj[0]||!gripObj[1]||dt<=0)return false;camera.getWorldPosition(headW);
 const rel=[0,1].map(i=>handHolder[i].position.clone().sub(headW));const v=rel.map((r,i)=>AS.prev[i]?r.clone().sub(AS.prev[i]).divideScalar(dt):new THREE.Vector3());AS.prev=rel;
 // forward axis = head yaw
 camera.getWorldDirection(fwd);fwd.y=0;fwd.normalize();AS.buf.push({t:clock.elapsedTime,a:v[0].y+v[0].dot(fwd)*.5,b:v[1].y+v[1].dot(fwd)*.5,s0:v[0].length(),s1:v[1].length()});
 while(AS.buf.length&&clock.elapsedTime-AS.buf[0].t>.5)AS.buf.shift();const n=AS.buf.length;if(n<8)return AS.on;
 let ma=0,mb=0,s0=0,s1=0;for(const f of AS.buf){ma+=f.a;mb+=f.b;s0+=f.s0;s1+=f.s1;}ma/=n;mb/=n;s0/=n;s1/=n;
 let cov=0,va=0,vb=0;for(const f of AS.buf){cov+=(f.a-ma)*(f.b-mb);va+=(f.a-ma)**2;vb+=(f.b-mb)**2;}const corr=cov/Math.sqrt(va*vb+1e-6);
 const thr=1.2/SET.armSens,mean=(s0+s1)/2,attack=Math.max(s0,s1)>2.5*Math.max(.05,Math.min(s0,s1));
 const want=(mean>thr&&corr<-.25&&!attack)?1:0;AS.score+=(want-AS.score)*Math.min(1,dt*4);
 if(!AS.on&&AS.score>.6)AS.on=true;else if(AS.on&&AS.score<.3)AS.on=false;return AS.on;}
window.__armswing=(on)=>{AS.on=on;AS.score=on?1:0;};
window.__asSim=(phaseDeg,amp,freq=2.2)=>{const g0_=gripObj[0],g1_=gripObj[1];gripObj[0]=gripObj[1]={};AS.prev=[null,null];AS.buf=[];AS.on=false;AS.score=0;const res=[];camera.getWorldPosition(headW);const h=headW.clone();let t0=clock.elapsedTime;
 const ct=clock.elapsedTime;for(let k=0;k<90;k++){const t=k/60;clock.elapsedTime=ct+t;const w=2*Math.PI*freq;
  handHolder[0].position.set(h.x-.25,h.y-.5+amp*Math.sin(w*t),h.z-.2+amp*.5*Math.cos(w*t));handHolder[1].position.set(h.x+.25,h.y-.5+amp*Math.sin(w*t+phaseDeg*Math.PI/180),h.z-.2+amp*.5*Math.cos(w*t+phaseDeg*Math.PI/180));res.push(armSwingRun(1/60));}
 clock.elapsedTime=ct;gripObj[0]=g0_;gripObj[1]=g1_;AS.on=false;AS.score=0;return res.slice(-10).every(Boolean);};
// headless sanity hook for the VR laser/menu path (simulates a controller ray hitting the world-space panel)
window.__laserTest=()=>{const m=UI.mode;openMenu(m||'pause');UI.panel.visible=true;camera.updateMatrixWorld(true);const hp=camera.getWorldPosition(new THREE.Vector3());const f=new THREE.Vector3(0,0,-1);
 UI.panel.position.copy(rig.worldToLocal(hp.clone().addScaledVector(f,1.5)));UI.panel.quaternion.identity();UI.panel.updateMatrixWorld(true);
 const it=UI.items.find(i=>i.label==='Settings');const tgt=new THREE.Vector3((it.x+it.w/2)/1024-.5,.5-(it.y+it.h/2)/768,0);tgt.x*=1.6;tgt.y*=1.2;UI.panel.localToWorld(tgt);
 const fake=new THREE.Object3D();fake.position.copy(hp).add(new THREE.Vector3(.2,-.3,0));fake.lookAt(tgt);fake.rotateY(Math.PI);fake.updateMatrixWorld(true);// -Z toward target
 const h=laserHit(fake);if(!h)return {hit:false};uiHover(h.x,h.y);const label=UI.items[UI.hover]?.label;uiPress(h.x,h.y);return {hit:true,label,modeAfter:UI.mode};};

// =================== Grab & throw physics ===================
// Liftable props: rocks, sticks, bones, skulls, candles, lanterns, crates (big crate = two-handed), potions, fire-sticks.
// Held objects follow the hand through a mass-dependent spring (heavy = laggy); release throws with hand linear + angular velocity.
var G={bodies:[],held:[null,null],hover:[null,null],gripPrev:[false,false],hist:[[],[]]};
function buildGrabbables(){const add=(obj,o)=>{obj.traverse(m=>{if(m.isMesh){m.castShadow=true;m.material=m.material.clone();}});scene.add(obj);
  const b=new THREE.Box3().setFromObject(obj);const r=b.getSize(new THREE.Vector3()).length()/2;
  const body={obj,mass:o.mass,r:Math.max(.05,r),bottom:obj.position.y-b.min.y,vel:new THREE.Vector3(),ang:new THREE.Vector3(),hands:new Set(),offs:[null,null],sleep:true,kind:o.kind,mat:o.mat||'wood',lastHit:0,spot:o.spot||null,potion:o.potion};G.bodies.push(body);return body;};
 const boneMat=new THREE.MeshStandardMaterial({color:0xcfc4a8,roughness:.8});
 const near=(a,b)=>randOffTrail(a,b,-110,6);
 for(let k=0;k<9;k++){const [x,z]=near(1.8,5);const s=.06+Math.random()*.1;const m=new THREE.Mesh(new THREE.DodecahedronGeometry(s,1),blockMat);m.scale.y=.7;m.position.set(x,s*.7,z);add(m,{mass:.3+s*20,kind:'rock',mat:'stone'});}
 for(let k=0;k<6;k++){const [x,z]=near(1.8,6);const g=new THREE.Group();const l=.6+Math.random()*.5;const c=new THREE.Mesh(new THREE.CylinderGeometry(.018,.026,l,5),barkMat);c.rotation.z=Math.PI/2;g.add(c);const tw=new THREE.Mesh(new THREE.CylinderGeometry(.008,.012,.25,4),barkMat);tw.position.set(l*.2,.07,0);tw.rotation.z=.6;g.add(tw);g.position.set(x,.03,z);g.rotation.y=Math.random()*6;add(g,{mass:.5,kind:'stick'});}
 for(let k=0;k<4;k++){const [x,z]=near(2,6);const sk=new THREE.Mesh(new THREE.SphereGeometry(.1,10,8),boneMat);sk.scale.set(1,.9,1.15);sk.position.set(x,.09,z);add(sk,{mass:.9,kind:'skull',mat:'bone'});
  const [x2,z2]=near(2,6);const bn=new THREE.Mesh(new THREE.CylinderGeometry(.02,.025,.42,6),boneMat);bn.rotation.set(Math.PI/2,0,Math.random()*3);bn.position.set(x2,.03,z2);add(bn,{mass:.4,kind:'bone',mat:'bone'});}
 for(let k=0;k<3;k++){const [x,z]=near(1.8,4);const c=new THREE.Group();const w=new THREE.Mesh(new THREE.CylinderGeometry(.03,.035,.16,8),new THREE.MeshStandardMaterial({color:0xeee0c0,emissive:0x221100}));w.position.y=.08;c.add(w);const f=makeFlame(.4);f.position.y=.2;c.add(f);c.position.set(x,0,z);add(c,{mass:.25,kind:'candle'});}
 for(let k=0;k<2;k++){const [x,z]=near(1.8,4);const L=new THREE.Group();const fr=new THREE.Mesh(new THREE.BoxGeometry(.14,.2,.14),new THREE.MeshStandardMaterial({color:0x222222,metalness:.8,roughness:.4,transparent:true,opacity:.55}));fr.position.y=.12;L.add(fr);const top=new THREE.Mesh(new THREE.ConeGeometry(.1,.08,4),metalMat);top.position.y=.26;top.rotation.y=Math.PI/4;L.add(top);const f=makeFlame(.5);f.position.y=.12;L.add(f);L.position.set(x,0,z);add(L,{mass:1.2,kind:'lantern',mat:'metal'});}
 for(const [sz,mass] of [[.3,2.5],[.3,2.5],[.55,7]]){const [x,z]=near(2.5,5);const c=new THREE.Mesh(new THREE.BoxGeometry(sz,sz,sz),woodMat);c.position.set(x,sz/2,z);c.rotation.y=Math.random()*3;add(c,{mass,kind:sz>.5?'big crate':'crate'});}
 for(let k=0;k<3;k++){const [x,z]=near(1.8,4,-90);const pb=new THREE.Group();const gl_=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.11,10),new THREE.MeshStandardMaterial({color:0xaa1020,emissive:0x400008,roughness:.15,transparent:true,opacity:.85}));gl_.position.y=.055;const nk=new THREE.Mesh(new THREE.CylinderGeometry(.012,.015,.05,6),gl_.material);nk.position.y=.135;pb.add(gl_,nk);pb.position.set(x,0,z);add(pb,{mass:.3,kind:'potion',mat:'glass',potion:true});}
 for(const so of F.stickObjs)add(so.grp,{mass:1.1,kind:'fire-stick',spot:so.spot});
}
function setHighlight(b,on){b.obj.traverse(m=>{if(m.isMesh&&m.material.emissive){if(on){m.userData.em=m.userData.em??m.material.emissive.getHex();m.material.emissive.setHex(0x553311);}else if(m.userData.em!==undefined)m.material.emissive.setHex(m.userData.em);}});}
function nearestBody(p,maxD){let best=null,bd=1e9;for(const b of G.bodies){if(b.hands.size&&b.mass<5)continue;const c=b.obj.getWorldPosition(new THREE.Vector3());c.y+=b.r*.3;const d=c.distanceTo(p)-b.r;if(d<maxD&&d<bd){bd=d;best=b;}}return best;}
function grab(b,i){if(b.potion){P.potions++;drawHud();scene.remove(b.obj);G.bodies.splice(G.bodies.indexOf(b),1);sfx.page();hapticI(i,.8,60);say('Picked up a healing potion.',2);return;}
 b.hands.add(i);G.held[i]=b;b.sleep=false;const hw=handHolder[i];hw.updateMatrixWorld(true);b.obj.updateMatrixWorld(true);
 b.offs[i]=new THREE.Matrix4().copy(hw.matrixWorld).invert().multiply(b.obj.matrixWorld); // object pose in hand space
 hapticI(i,.5+Math.min(.5,b.mass/8),40);if(b.mass>=5&&b.hands.size<2)say('Too heavy for one hand — grab it with both.',2);}
function release(i){const b=G.held[i];if(!b)return;G.held[i]=null;b.hands.delete(i);b.offs[i]=null;if(b.hands.size)return;
 const h=G.hist[i];if(h.length>=2){const a=h[0],z=h[h.length-1],dt=Math.max(1e-3,z.t-a.t);b.vel.copy(z.p).sub(a.p).divideScalar(dt);
  const dq=z.q.clone().multiply(a.q.clone().invert());const ang=2*Math.acos(Math.min(1,Math.abs(dq.w)));const ax=new THREE.Vector3(dq.x,dq.y,dq.z);if(ax.lengthSq()>1e-8)b.ang.copy(ax.normalize().multiplyScalar(ang/dt*(dq.w<0?-1:1)));}
 b.vel.multiplyScalar(1/Math.sqrt(Math.max(1,b.mass)));b.ang.multiplyScalar(1/Math.max(1,b.mass));b.thrown=b.vel.length()>2;b.sleep=false;}
const _tm=new THREE.Matrix4(),_tp=new THREE.Vector3(),_tq=new THREE.Quaternion(),_ts=new THREE.Vector3();
function updateGrab(dt,xr,pp){const now=clock.elapsedTime;
 for(let i=0;i<2;i++){const hh=handHolder[i];const hist=G.hist[i];hist.push({t:now,p:hh.position.clone(),q:hh.quaternion.clone()});while(hist.length>5)hist.shift();}
 if(xr)for(let i=0;i<2;i++){if(!gripObj[i])continue;const g=!!srcs[i]?.gamepad?.buttons[1]?.pressed;const hp=handHolder[i].position;
  // hover highlight + haptic tick (not for the sword hand)
  const hv=(swordHand===i||axeHand===i||G.held[i]||!SET.physics)?null:nearestBody(hp,.12);if(hv!==G.hover[i]){if(G.hover[i]&&G.hover[i]!==G.hover[1-i])setHighlight(G.hover[i],false);if(hv){setHighlight(hv,true);hapticI(i,.15,15);}G.hover[i]=hv;}
  if(g&&!G.gripPrev[i]&&swordHand!==i&&axeHand!==i&&!G.held[i]){const sa=sheathAnchor.getWorldPosition(_v1);const nearSheath=(swordHand===-1&&hp.distanceTo(sa)<.4&&hp.y>headW.y-.3)||(axeHand===-1&&hp.distanceTo(hipAnchor.getWorldPosition(_v2))<.3); // weapon draws have priority
   if(!nearSheath&&hv)grab(hv,i);}
  if(!g&&G.gripPrev[i]&&G.held[i])release(i);G.gripPrev[i]=g;}
 // integrate
 for(const b of G.bodies){const o=b.obj;
  if(b.hands.size){const targets=[...b.hands].map(i=>{_tm.copy(handHolder[i].matrixWorld).multiply(b.offs[i]);_tm.decompose(_tp,_tq,_ts);return {p:_tp.clone(),q:_tq.clone()};});
   const tp=targets[0].p.clone();if(targets[1])tp.lerp(targets[1].p,.5);const heavy=b.mass>=5&&b.hands.size<2;
   if(heavy){tp.y=Math.min(tp.y,b.bottom+.05);} // one hand can only drag it
   const k=1-Math.exp(-dt*(heavy?3:60/Math.max(1,b.mass)));const prev=o.position.clone();o.position.lerp(tp,k);o.quaternion.slerp(targets[0].q,k);
   if(o.position.y<b.bottom)o.position.y=b.bottom;b.vel.copy(o.position).sub(prev).divideScalar(Math.max(dt,1e-3));}
  else if(!b.sleep){b.vel.y-=9.81*dt;const step=b.vel.clone().multiplyScalar(dt);const nx=o.position.x+step.x,nz=o.position.z+step.z;
   if(solid(nx,nz)){b.vel.x*=-.4;b.vel.z*=-.4;impact(b,b.vel.length()+2);}else{o.position.x=nx;o.position.z=nz;}o.position.y+=step.y;
   if(b.ang.lengthSq()>1e-6){o.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(b.ang.clone().normalize(),b.ang.length()*dt));b.ang.multiplyScalar(Math.exp(-dt*1.2));}
   if(o.position.y<b.bottom){o.position.y=b.bottom;const vy=-b.vel.y;if(vy>1.2)impact(b,vy);b.vel.y=vy>.8?vy*.35:0;b.vel.x*=.7;b.vel.z*=.7;b.ang.multiplyScalar(.6);
    if(b.vel.lengthSq()<.02){b.vel.set(0,0,0);b.ang.set(0,0,0);b.sleep=true;b.thrown=false;}}
   // enemy hits
   const sp=b.vel.length();if(sp>2.5&&now-b.lastHit>.3)for(const e of enemies){if(e.dead)continue;const ep=e.mesh.position;if(Math.hypot(ep.x-o.position.x,ep.z-o.position.z)<.55&&o.position.y<1.9){b.lastHit=now;
     const dmg=Math.max(1,Math.round(b.mass*sp*.35+Math.random()*2));e.hp-=dmg;e.stun=Math.min(1.5,.3+b.mass*.15);impact(b,sp);sfx.hit();if(e.hp<=0){e.dead=true;e.cur=null;play(e,'Death',.1);e.deadT=3;say(`The ${e.type} falls.`,2);}else if(e.A.HitReact){e.cur=null;play(e,'HitReact',.05);}
     b.vel.multiplyScalar(-.3);break;}}}
  if(b.spot){b.spot.copy(o.localToWorld(new THREE.Vector3(0,1.75,0)));}}
 // desktop: held object rides in the right hand
}
function impact(b,v){if(!AC||clock.elapsedTime-(b.lastSnd||0)<.08)return;b.lastSnd=clock.elapsedTime;const vol=Math.min(.5,.05*v*Math.sqrt(b.mass));
 const f={stone:180,bone:420,metal:900,glass:1800,wood:260}[b.mat]||260;tone(f*(.8+Math.random()*.4),b.mat==='metal'||b.mat==='glass'?'triangle':'square',b.mat==='metal'?.5:.12,vol,f*.5);
 if(b.mat==='wood'||b.mat==='stone'){const s=AC.createBufferSource();s.buffer=window._noise;const fl=AC.createBiquadFilter();fl.type='lowpass';fl.frequency.value=b.mat==='stone'?900:500;const g=AC.createGain();env(g,.002,vol,.15);s.connect(fl).connect(g).connect(sfxBus);s.start();s.stop(AC.currentTime+.2);}}
function deskGrabToggle(){if(G.held[1]){release(1);G.held[1]&&release(1);return;}if(swordHand>=0)sheathe();camera.getWorldDirection(fwd);const p=headW.clone().addScaledVector(fwd,1.1);p.y=Math.max(.2,p.y-.9);const b=nearestBody(p,1.1);if(b){b.obj.position.copy(handHolder[1].position);grab(b,1);}}
function deskThrow(){const b=G.held[1];if(!b)return;release(1);camera.getWorldDirection(fwd);b.vel.copy(fwd).multiplyScalar(9/Math.sqrt(Math.max(1,b.mass))).add(new THREE.Vector3(0,2,0));b.ang.set(Math.random()*8,Math.random()*8,0);b.thrown=true;}
window.__grab={bodies:()=>G.bodies.map(b=>({k:b.kind,m:b.mass,y:+b.obj.position.y.toFixed(2),sleep:b.sleep,held:b.hands.size})),deskGrab:deskGrabToggle,deskThrow,near:()=>{camera.getWorldDirection(fwd);const p=headW.clone().addScaledVector(fwd,1.1);p.y=.4;return nearestBody(p,3)?.kind}};
window.__G_dbg=()=>G.bodies;

// =================== Real Life Physics System: axe, hip holster, tree chopping & felling ===================
var hipAnchor=new THREE.Group();hipAnchor.position.set(-.21,-.62,.02);hipAnchor.rotation.set(0,0,.12);torso.add(hipAnchor);
var axe=new THREE.Group(),axeTip=new THREE.Object3D(),axeEdgeDir=new THREE.Vector3(0,0,1),axePrevTip=new THREE.Vector3(),AXP=[false,false];
const AXE_IN_HAND=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,-1),new THREE.Vector3(0,-1,0))); // handle(+Y)->grip -Z, edge(+Z)->grip -Y
async function loadAxe(){const g=await loadG('assets/models/wooden_axe.glb');const m=g.scene;const S=1.3;m.scale.setScalar(S);m.position.set(0,.17*S,0);// grip near the handle end
 m.traverse(o=>{if(o.isMesh)o.castShadow=false;});axe.add(m);axeTip.position.set(0,.36,.13);m.add(axeTip);holsterAxe(true);}
function drawAxe(i){axeHand=i;handHolder[i].add(axe);axe.position.set(0,0,0);axe.quaternion.copy(AXE_IN_HAND);sfx?.swing?.();}
function holsterAxe(silent){axeHand=-1;hipAnchor.add(axe);axe.position.set(0,-.05,0);axe.quaternion.identity();if(!silent)sfx?.swing?.();}
function updateAxeHolster(xr){if(!xr)return;for(let i=0;i<2;i++){if(!gripObj[i])continue;const g=!!srcs[i]?.gamepad?.buttons[1]?.pressed;const hp=handHolder[i].position;
  if(g&&!AXP[i]&&axeHand===-1&&swordHand!==i&&!G.held[i]&&hp.distanceTo(hipAnchor.getWorldPosition(_v3))<.3){drawAxe(i);hapticI(i,1,120);}
  if(!g&&AXP[i]&&axeHand===i){holsterAxe();hapticI(i,.6,80);}AXP[i]=g;}}
// wood chips / dust (small pooled particles)
const CHIPS=[];const chipG=new THREE.BoxGeometry(.03,.012,.05),chipM=new THREE.MeshStandardMaterial({color:0xc8a070,roughness:.9});
const dustT=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(120,105,90,.6)');r.addColorStop(1,'rgba(120,105,90,0)');g.fillStyle=r;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
function spawnChips(p,dir,n){for(let k=0;k<n;k++){const m=new THREE.Mesh(chipG,chipM);m.position.copy(p);scene.add(m);CHIPS.push({m,v:dir.clone().multiplyScalar(1.5+Math.random()*2).add(new THREE.Vector3((Math.random()-.5)*2,1+Math.random()*1.5,(Math.random()-.5)*2)),r:new THREE.Vector3(Math.random()*20,Math.random()*20,0),life:1.5});}}
function spawnDust(p,n,size=1.5){for(let k=0;k<n;k++){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:dustT,transparent:true,depthWrite:false,opacity:.7}));sp.position.copy(p).add(new THREE.Vector3((Math.random()-.5)*2,.3,(Math.random()-.5)*2));sp.scale.setScalar(size*.4);scene.add(sp);CHIPS.push({m:sp,v:new THREE.Vector3((Math.random()-.5),.4+Math.random()*.4,(Math.random()-.5)),dust:true,life:2.2,size});}}
function chopSound(hard){if(!AC)return;const s=AC.createBufferSource();s.buffer=window._noise;const f=AC.createBiquadFilter();f.type='bandpass';f.frequency.value=hard?900:3200;f.Q.value=2;const g=AC.createGain();env(g,.002,hard?.5:.18,hard?.18:.08);s.connect(f).connect(g).connect(sfxBus);s.start();s.stop(AC.currentTime+.3);tone(hard?130:1800,hard?'square':'triangle',hard?.15:.25,hard?.25:.08,hard?70:1500);}
function creakSound(){if(!AC)return;const o=AC.createOscillator();o.type='sawtooth';const t=AC.currentTime;o.frequency.setValueAtTime(140,t);o.frequency.exponentialRampToValueAtTime(45,t+2.2);const f=AC.createBiquadFilter();f.type='bandpass';f.frequency.value=500;f.Q.value=6;const g=AC.createGain();env(g,.3,.35,2);o.connect(f).connect(g).connect(sfxBus);o.start();o.stop(t+2.6);}
function thudSound(m){if(!AC)return;const s=AC.createBufferSource();s.buffer=window._noise;const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=220;const g=AC.createGain();env(g,.005,Math.min(1,.5*m),1.4);s.connect(f).connect(g).connect(sfxBus);s.start();s.stop(AC.currentTime+1.6);tone(48,'sine',.8,.6,28);}
const FALLING=[];
function treesNear(x,z){const out=[];const kx=Math.floor(x/4),kz=Math.floor(z/4);for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const l=F.hash.get((kx+a)+','+(kz+b));if(l)for(const t of l)if(t.v!==undefined&&t.r>0)out.push(t);}return out;}
let axeSwingCd=0;
function weaponTreeHit(tip,vel,speed,isAxe,hand,xr){const now=clock.elapsedTime;
 for(const t of treesNear(tip.x,tip.z)){const d=Math.hypot(tip.x-t.x,tip.z-t.z);if(d>t.r+.12||tip.y<.15||tip.y>2.4)continue;if(now-(t.lastHit||0)<.3)continue;
  const edgeOK=!xr||!isAxe||vel.clone().normalize().dot(axeEdgeDir)>.45;const hard=speed>(xr?3.5:2);t.lastHit=now;
  const toC=new THREE.Vector3(t.x-tip.x,0,t.z-tip.z).normalize();const surf=new THREE.Vector3(t.x,tip.y,t.z).addScaledVector(toC,-t.r*.9);
  if(isAxe&&hard&&edgeOK){t.hits++;chopSound(true);hapticI(hand,1,70);spawnChips(surf,toC.clone().negate(),6);
   const n=new THREE.Mesh(new THREE.BoxGeometry(.12,.06,.05),new THREE.MeshStandardMaterial({color:0xd8b080,roughness:1}));n.position.copy(surf);n.lookAt(t.x,tip.y,t.z);scene.add(n);(t.notches=t.notches||[]).push(n);
   const need=Math.ceil(4+t.r*18);if(t.hits===need-2)say('The trunk groans...',1.5);if(t.hits>=need)fellTree(t,toC);}
  else{t.hits+=isAxe?.25:.08;chopSound(false);hapticI(hand,.35,30);if(!isAxe){const sc_=new THREE.Mesh(new THREE.BoxGeometry(.1,.008,.01),new THREE.MeshBasicMaterial({color:0x9a8a70}));sc_.position.copy(surf);sc_.lookAt(t.x,tip.y,t.z);sc_.rotateZ(Math.random()*3);scene.add(sc_);}}
  return true;}return false;}
function fellTree(t,dir){const ref=t.M._ref;ref.im.setMatrixAt(ref.i,new THREE.Matrix4().makeScale(0,0,0));ref.im.instanceMatrix.needsUpdate=true;const r0=t.r;t.r=0;
 const pos=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3();t.M.decompose(pos,q,sc);
 const piv=new THREE.Group();piv.position.copy(pos);scene.add(piv);const mesh=new THREE.Mesh(F.treeGeos[t.v],barkMat);mesh.quaternion.copy(q);mesh.scale.copy(sc);mesh.castShadow=true;piv.add(mesh);
 for(const n of t.notches||[])piv.attach(n);
 const fd=dir.clone().setY(0).normalize();const axis=new THREE.Vector3(0,1,0).cross(fd).normalize();creakSound();haptic(.6,300);
 FALLING.push({t,piv,axis,fd,th:.03,w:0,L:4.5*sc.y,r0,done:false});}
function updateFallingTrees(dt){for(const f of FALLING){if(f.done)continue;const a=1.5*9.81/f.L*Math.sin(f.th);f.w+=a*dt;f.th+=f.w*dt;
  if(f.th>=1.48){f.th=1.48;f.done=true;const base=f.piv.position;thudSound(f.r0*3);haptic(1,350);for(let k=1;k<5;k++)spawnDust(base.clone().addScaledVector(f.fd,f.L*k/5),2,2);
   for(const e of enemies){if(e.dead)continue;const ep=e.mesh.position.clone().sub(base);const along=ep.dot(f.fd),perp=ep.clone().addScaledVector(f.fd,-along).setY(0).length();if(along>0&&along<f.L&&perp<1.1){const d=3+Math.floor(Math.random()*16);e.hp-=d;e.stun=2;sfx.hit();if(e.hp<=0){e.dead=true;e.cur=null;play(e,'Death',.1);e.deadT=3;say(`The falling tree crushes the ${e.type}!`,2.5);}}}
   // fallen trunk becomes a static obstacle
   for(let d=.6;d<f.L*.9;d+=.7){const p=base.clone().addScaledVector(f.fd,d);const t2={x:p.x,z:p.z,r:Math.max(.25,f.r0*.8*(1-d/f.L))};const k=Math.floor(p.x/4)+','+Math.floor(p.z/4);if(!F.hash.has(k))F.hash.set(k,[]);F.hash.get(k).push(t2);}}
  f.piv.quaternion.setFromAxisAngle(f.axis,f.th);}
 for(let i=CHIPS.length-1;i>=0;i--){const c=CHIPS[i];c.life-=dt;if(c.dust){c.m.position.addScaledVector(c.v,dt);c.m.scale.setScalar(c.size*(.4+(2.2-c.life)*.5));c.m.material.opacity=Math.max(0,c.life/2.2*.6);}
  else{c.v.y-=9.81*dt;c.m.position.addScaledVector(c.v,dt);if(c.m.position.y<.01){c.m.position.y=.01;c.v.multiplyScalar(.3);c.v.y=0;}else{c.m.rotation.x+=c.r.x*dt;c.m.rotation.y+=c.r.y*dt;}}
  if(c.life<=0&&(c.dust||CHIPS.length>120)){scene.remove(c.m);c.m.material.dispose?.();CHIPS.splice(i,1);}else if(c.life<=0&&!c.dust)c.life=9999;}}
function updateAxe(dt,xr,pp){axeTip.updateWorldMatrix(true,false);const tip=axeTip.getWorldPosition(new THREE.Vector3());const vel=tip.clone().sub(axePrevTip).divideScalar(Math.max(dt,1e-3));const speed=vel.length();axePrevTip.copy(tip);
 axeEdgeDir.set(0,0,1).applyQuaternion(axeTip.parent.getWorldQuaternion(new THREE.Quaternion()));
 if(axeHand<0||!SET.physics)return;const swingingA=xr?speed>2.5:desktopSwing>0.05&&desktopSwing<.3;if(!swingingA)return;
 weaponTreeHit(tip,vel,speed,true,axeHand,xr);
 for(const e of enemies){if(e.dead||(e.hitCd||0)>0)continue;const c=new THREE.Vector3(e.mesh.position.x,1.2,e.mesh.position.z);if(tip.distanceTo(c)<.6||(!xr&&e.mesh.position.distanceTo(pp)<2.2&&inFront(e.mesh.position))){e.hitCd=.45;if(hitEnemy(e,xr?speed:5))hapticI(axeHand,1,90);}}}
window.__axe={draw:()=>drawAxe(1),holster:()=>holsterAxe(),hand:()=>axeHand,tree:()=>{const t=F.trees.find(t=>t.r>0);return t},chop:(t,n)=>{for(let k=0;k<n;k++){t.lastHit=0;const tip=new THREE.Vector3(t.x+t.r+.05,1.1,t.z);weaponTreeHit(tip,new THREE.Vector3(-6,0,0),6,true,1,false);}return {hits:t.hits,need:Math.ceil(4+t.r*18),falling:FALLING.length,r:t.r};},step:(n)=>{for(let k=0;k<n;k++)updateFallingTrees(1/72);return {fallen:FALLING.filter(f=>f.done).length,chips:CHIPS.length}},falling:()=>FALLING.map(f=>({th:+f.th.toFixed(2),done:f.done}))};
