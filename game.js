import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

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

// ---- Renderer ----
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.xr.enabled=true;renderer.xr.setFoveation?.(1);renderer.xr.setFramebufferScaleFactor?.(0.9);
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
const solid=(x,z)=>{const c=cell(Math.floor(x/T+0.5),Math.floor(z/T+0.5));return c==='#'||(c==='N'&&!gateOpen)||(c==='O');};
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
async function loadAvatar(){const g=await loadG('assets/models/soldier.glb');av=g.scene;avatar.add(av);
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
function twoBoneIK(side,target,handQuat){const S=side?'Right':'Left';const up=bones[S+'Arm'],lo=bones[S+'ForeArm'],hd=bones[S+'Hand'];if(!up)return;
 const sh=up.getWorldPosition(new THREE.Vector3()),el=lo.getWorldPosition(new THREE.Vector3()),wr=hd.getWorldPosition(new THREE.Vector3());
 const L1=sh.distanceTo(el),L2=el.distanceTo(wr);const d=target.clone().sub(sh);const L=Math.min(d.length(),L1+L2-1e-3);d.normalize();
 const a=(L1*L1-L2*L2+L*L)/(2*L),r=Math.sqrt(Math.max(0,L1*L1-a*a));
 const pole=new THREE.Vector3(side?.5:-.5,-1,.4).applyQuaternion(torso.quaternion);pole.addScaledVector(d,-pole.dot(d)).normalize();
 const elbow=sh.clone().addScaledVector(d,a).addScaledVector(pole,r);aim(up,lo,elbow);aim(lo,hd,sh.clone().addScaledVector(d,L));
 setWorldQuat(hd,handQuat);}
// Mixamo hand: bone +Y runs along fingers. Map to controller grip: fingers forward (-Z), palm inward.
// Hand offsets derived from the rig's bind pose (robust to whatever local axes the rig uses).
// For each hand bone we measure, in bone-local space: F = wrist->middle knuckle (finger direction),
// S = pinky knuckle->index knuckle (thumb side), N = palm normal (left: F x S, right: S x F).
// WebXR grip space: -Z runs along the held object toward the thumb/index side, X is perpendicular to the palm
// (palm faces +X for the left hand, -X for the right), so S_g=(0,0,-1), N_g=(+-1,0,0), F_g=N_g-consistent.
// handOff[i] maps bone-local basis -> grip basis, so boneWorld = gripWorld * handOff[i] exactly.
const handOff=[new THREE.Quaternion(),new THREE.Quaternion()],palmOff=[new THREE.Vector3(0,0,.07),new THREE.Vector3(0,0,.07)],handCorr=[new THREE.Quaternion(),new THREE.Quaternion()];
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
  palmOff[i].copy(Fg).multiplyScalar(.55*len).addScaledVector(Ng,.025);
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
function draw(i){swordHand=i;handHolder[i].add(sword);sword.position.set(0,0,0);sword.quaternion.copy(handCorr[i]);sfx?.swing();}
swordHand=-1;sheathAnchor.add(sword);sword.position.set(0,0,-.08);
const torchHand=()=>swordHand===0?1:0;
const gripPrev=[false,false];let moving=0;
function updateAvatar(xr,dt){const hq=camera.getWorldQuaternion(new THREE.Quaternion());camera.getWorldPosition(headW);
 const e=new THREE.Euler().setFromQuaternion(hq,'YXZ');let ty=torso.rotation.y;let dy=Math.atan2(Math.sin(e.y-ty),Math.cos(e.y-ty));
 if(Math.abs(dy)>.6)ty+=dy-Math.sign(dy)*.6;ty+=dy*Math.min(1,dt*2.5);torso.rotation.set(0,ty,0);
 const back=new THREE.Vector3(0,0,.12).applyAxisAngle(THREE.Object3D.DEFAULT_UP,ty);
 avatar.position.set(headW.x+back.x,0,headW.z+back.z);avatar.rotation.y=ty;avatar.scale.setScalar(Math.max(.8,Math.min(1.3,(headW.y-.05)/avEye)));
 // hand frames
 for(let i=0;i<2;i++){const src=xr?gripObj[i]:deskHand[i];if(!src)continue;src.updateWorldMatrix(true,false);src.matrixWorld.decompose(handHolder[i].position,handHolder[i].quaternion,_v1);
  if(!xr&&i===1&&desktopSwing>0){const k=1-desktopSwing/.35;handHolder[i].quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.sin(k*Math.PI)*1.5,Math.sin(k*Math.PI)*.9,0)));handHolder[i].position.add(new THREE.Vector3(-Math.sin(k*Math.PI)*.2,Math.sin(k*Math.PI)*.1,0).applyQuaternion(hq));}}
 if(av){const want=moving>.05?'Walk':'Idle';for(const n of ['Idle','Walk']){const a=avActs[n];if(!a)continue;if(n===want&&!a.isRunning())a.reset().fadeIn(.25).play();else if(n!==want&&a.isRunning()&&a.getEffectiveWeight()>0)a.fadeOut(.25);}
  avMixer.update(dt);bones.Head.scale.setScalar(.001);av.updateMatrixWorld(true);
  if(bones.Neck){setWorldQuat(bones.Neck,hq.clone().multiply(neckRel));}
  for(let i=0;i<2;i++){if(xr&&!gripObj[i])continue;const gq=handHolder[i].quaternion.clone().multiply(handCorr[i]);const hqq=gq.clone().multiply(handOff[i]);
   const wristT=handHolder[i].position.clone().sub(palmOff[i].clone().multiplyScalar(avatar.scale.x).applyQuaternion(gq));
   twoBoneIK(i,wristT,hqq);}
  for(let i=0;i<2;i++){if(xr&&!gripObj[i])continue;const hd=bones[(i?'Right':'Left')+'Hand'];if(hd)setWorldQuat(hd,handHolder[i].quaternion.clone().multiply(handCorr[i]).multiply(handOff[i]));}
  if(bones.Spine2){bones.Spine2.getWorldPosition(torso.position);}
  {const hy=bones.Head.getWorldPosition(_v1).y/avatar.scale.y;if(hy>.5)avEye+=(hy+.1-avEye)*Math.min(1,dt*5);}}
 else torso.position.set(headW.x,headW.y-.35,headW.z).add(back);
 // cloak sway
 const pa=cloakG.attributes.position;for(let k=0;k<pa.count;k++){const y=cloakBase[k*3+1];pa.array[k*3+2]=cloakBase[k*3+2]+(-y)*(.15*moving+.03*Math.sin(clock.elapsedTime*2+y*4+cloakBase[k*3]*3));}pa.needsUpdate=true;
 // grab/sheathe (either hand)
 if(xr)for(let i=0;i<2;i++){const g=!!srcs[i]?.gamepad?.buttons[1]?.pressed;const sa=sheathAnchor.getWorldPosition(_v1);
  if(g&&!gripPrev[i]&&swordHand===-1&&handHolder[i].position.distanceTo(sa)<.4&&handHolder[i].position.y>headW.y-.3){draw(i);hapticI(i,1,120);}
  if(!g&&gripPrev[i]&&swordHand===i){sheathe();hapticI(i,.6,80);}gripPrev[i]=g;}
 const th=torchHand();if(torchMesh.parent!==handHolder[th])handHolder[th].add(torchMesh);}
// Calibration: hold both controllers pointing straight forward (like holding two sword hilts), click both sticks for 2s.
// The ideal grip pose for that stance is 'grip -Z forward, +Y up'; any residual rotation becomes a per-hand correction.
function calibrateHands(){camera.getWorldDirection(fwd);fwd.y=0;fwd.normalize();const ideal=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(),fwd,THREE.Object3D.DEFAULT_UP));
 for(let i=0;i<2;i++){if(!gripObj[i])continue;handCorr[i].copy(handHolder[i].quaternion.clone().invert().multiply(ideal));hapticI(i,1,200);}if(swordHand>=0)sword.quaternion.copy(handCorr[swordHand]);say('Hands calibrated. Hold both sticks in again for 2s to recalibrate.',3);}
function hapticI(i,v,ms){srcs[i]?.gamepad?.hapticActuators?.[0]?.pulse?.(v,ms);}
renderer.xr.addEventListener('sessionstart',()=>{document.getElementById('start').style.display='none';document.getElementById('vig').style.display='none';audioStart();});
renderer.xr.addEventListener('sessionend',()=>{document.getElementById('vig').style.display='';});
// ---- Audio (Web Audio, procedural) ----
let AC=null,master,listenerPanners=[];
function audioStart(){if(AC)return;AC=new (window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.gain.value=.6;master.connect(AC.destination);
 // drone
 [43,45.5,64.3].forEach(f=>{const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=f;const g=AC.createGain();g.gain.value=.05;const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=180;
  const lfo=AC.createOscillator();lfo.frequency.value=.07+Math.random()*.1;const lg=AC.createGain();lg.gain.value=80;lfo.connect(lg).connect(lp.frequency);lfo.start();o.connect(lp).connect(g).connect(master);o.start();});
 // wind noise
 const nb=AC.createBuffer(1,AC.sampleRate*3,AC.sampleRate);const d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
 const n=AC.createBufferSource();n.buffer=nb;n.loop=true;const bp=AC.createBiquadFilter();bp.type='bandpass';bp.frequency.value=400;bp.Q.value=.7;const ng=AC.createGain();ng.gain.value=.05;
 const wl=AC.createOscillator();wl.frequency.value=.1;const wg=AC.createGain();wg.gain.value=250;wl.connect(wg).connect(bp.frequency);wl.start();n.connect(bp).connect(ng).connect(master);n.start();
 window._noise=nb;
 setInterval(()=>{if(Math.random()<.35)creak();if(Math.random()<.2)whisper();},4000);
}
function env(g,a,peak,dec){const t=AC.currentTime;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+dec);}
function creak(){const o=AC.createOscillator();o.type='square';const t=AC.currentTime;o.frequency.setValueAtTime(90+Math.random()*60,t);o.frequency.linearRampToValueAtTime(140+Math.random()*80,t+1.2);
 const f=AC.createBiquadFilter();f.type='bandpass';f.frequency.value=700;f.Q.value=8;const g=AC.createGain();env(g,.3,.06,1.2);const p=AC.createStereoPanner();p.pan.value=Math.random()*2-1;o.connect(f).connect(g).connect(p).connect(master);o.start();o.stop(t+2);}
function whisper(){const s=AC.createBufferSource();s.buffer=window._noise;const f=AC.createBiquadFilter();f.type='bandpass';f.frequency.value=2500+Math.random()*1500;f.Q.value=4;const g=AC.createGain();env(g,.4,.08,1.5);const p=AC.createStereoPanner();p.pan.value=Math.random()<.5?-1:1;s.connect(f).connect(g).connect(p).connect(master);s.start();s.stop(AC.currentTime+2.2);}
function sting(){if(!AC)return;const t=AC.currentTime;[220,233,311,330].forEach(fr=>{const o=AC.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(fr,t);o.frequency.exponentialRampToValueAtTime(fr*1.5,t+.6);const g=AC.createGain();env(g,.01,.12,1.4);o.connect(g).connect(master);o.start();o.stop(t+1.6);});
 const s=AC.createBufferSource();s.buffer=window._noise;const g=AC.createGain();env(g,.01,.4,.8);s.connect(g).connect(master);s.start();s.stop(t+1);}
function tone(f,type,dur,vol,slide){if(!AC)return;const o=AC.createOscillator();o.type=type;const t=AC.currentTime;o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(slide,t+dur);const g=AC.createGain();env(g,.005,vol,dur);o.connect(g).connect(master);o.start();o.stop(t+dur+.1);}
const sfx={hit:()=>{tone(120,'square',.25,.3,40);tone(900,'triangle',.08,.15)},hurt:()=>tone(80,'sawtooth',.5,.35,30),page:()=>{tone(523,'sine',.6,.15);setTimeout(()=>tone(392,'sine',.9,.12),200)},
 heal:()=>tone(330,'sine',.8,.2,660),swing:()=>{if(!AC)return;const s=AC.createBufferSource();s.buffer=window._noise;const f=AC.createBiquadFilter();f.type='highpass';f.frequency.value=1500;const g=AC.createGain();env(g,.02,.15,.18);s.connect(f).connect(g).connect(master);s.start();s.stop(AC.currentTime+.3)},
 growl:(pan)=>{if(!AC)return;const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=55+Math.random()*20;const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=400;const g=AC.createGain();env(g,.2,.12,.9);const p=AC.createStereoPanner();p.pan.value=pan;o.connect(f).connect(g).connect(p).connect(master);o.start();o.stop(AC.currentTime+1.3);}};

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
 ghoulSpawns.forEach(p=>spawn('ghoul',p));spawn('wraith',new THREE.Vector3(11*T,0,1*T));spawn('wraith',new THREE.Vector3(2*T,0,9*T));}
const roll=(n,s,b)=>{let t=b;for(let i=0;i<n;i++)t+=1+Math.floor(Math.random()*s);return t;};

// ---- Jump scares ----
const scares=[{x:11*T,z:9*T,done:false},{x:4*T,z:5*T,done:false},{x:19*T,z:2*T,done:false},{x:10*T,z:13*T,done:false}];
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
function say(t,dur=5){msgEl.textContent=t;msgT=dur;mctx.clearRect(0,0,1024,160);mctx.fillStyle='rgba(0,0,0,.6)';mctx.fillRect(0,0,1024,160);mctx.fillStyle='#e8d8b0';mctx.font='28px serif';mctx.textAlign='center';
 const words=t.split(' ');let line='',y=50;for(const w of words){if(mctx.measureText(line+w).width>980){mctx.fillText(line,512,y);line='';y+=36;}line+=w+' ';}mctx.fillText(line,512,y);msgTex.needsUpdate=true;msgPlane.visible=true;}
function drawHud(){hctx.fillStyle='rgba(10,8,6,.85)';hctx.fillRect(0,0,256,128);hctx.fillStyle='#600';hctx.fillRect(10,10,236,28);hctx.fillStyle='#d22';hctx.fillRect(10,10,236*Math.max(0,P.hp)/P.maxHp,28);
 hctx.fillStyle='#fff';hctx.font='bold 20px sans-serif';hctx.fillText(`HP ${Math.max(0,P.hp)}/${P.maxHp}  AC ${P.ac}`,16,32);hctx.fillStyle='#e8d8b0';hctx.fillText(`Potions ${P.potions}  Pages ${P.pages}/${PAGES_NEEDED}`,12,70);
 hctx.fillStyle='#8ac';hctx.fillText(`Focus ${P.focus}/20`,12,105);hudTex.needsUpdate=true;
 hudEl.textContent=`${ALDEN.name} — HP ${Math.max(0,P.hp)}/${P.maxHp} | AC ${P.ac} | Potions ${P.potions} | Pages ${P.pages}/${PAGES_NEEDED} | Focus ${P.focus}`;}
function haptic(v,ms){for(const s of [leftSrc,rightSrc])s?.gamepad?.hapticActuators?.[0]?.pulse?.(v,ms);}
function usePotion(){if(P.dead||P.won||P.potions<=0||P.hp>=P.maxHp)return;P.potions--;const h=roll(2,4,2);P.hp=Math.min(P.maxHp,P.hp+h);sfx.heal();say(`Healing potion: +${h} HP`,2);drawHud();}
function hurt(e){if(P.iframes>0||P.dead||P.won)return;const atk=roll(1,20,3);if(atk<P.ac){say(`The ${e.type} misses — your leather armor holds.`,1.5);P.iframes=.6;return;}
 const d=roll(...e.dmg);P.hp-=d;P.iframes=1;sfx.hurt();haptic(.8,200);redFlash=.6;drawHud();if(P.hp<=0)die();}
function die(){P.dead=true;say("Alden Kael has fallen. The keep claims another Kael... Press trigger / click / R to rise again.",999);}
function restart(){location.reload();}
function hitEnemy(e,speed){const atk=roll(1,20,ALDEN.atk);if(atk<e.ac&&speed<4){sfx.swing();return false;}
 const d=roll(1,8,mod(ALDEN.str))+(speed>5?roll(1,4,0):0);e.hp-=d;e.stun=.7;sfx.hit();
 const push=e.mesh.position.clone().sub(rig.position).setY(0).normalize().multiplyScalar(.5);tryMove(e.mesh.position,push.x,push.z,.3);
 if(e.hp<=0){e.dead=true;e.cur=null;play(e,'Death',.1);e.deadT=3;say(`The ${e.type} collapses into dust.`,2);}else{if(e.A.HitReact){e.cur=null;play(e,'HitReact',.05);}}return true;}

// ---- Desktop input ----
const keys={};let yaw=0,pitch=0,locked=false,desktopSwing=0;
addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyQ')usePotion();if(e.code==='KeyR'&&(P.dead||P.won))restart();if(e.code==='KeyF'&&!renderer.xr.isPresenting){swordHand===-1?draw(1):sheathe();}});
addEventListener('keyup',e=>keys[e.code]=false);
document.getElementById('play').onclick=()=>{audioStart();renderer.domElement.requestPointerLock?.();document.getElementById('start').style.display='none';};
renderer.domElement.addEventListener('click',()=>{if(P.dead||P.won)return restart();if(!locked)renderer.domElement.requestPointerLock?.();else if(desktopSwing<=0&&swordHand>=0){desktopSwing=.35;sfx.swing();}});
document.addEventListener('pointerlockchange',()=>locked=document.pointerLockElement===renderer.domElement);
addEventListener('mousemove',e=>{if(!locked)return;yaw-=e.movementX*.0025;pitch=Math.max(-1.4,Math.min(1.4,pitch-e.movementY*.0025));});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
function tryMove(pos,dx,dz,r=.3){const nx=pos.x+dx;if(!solid(nx+Math.sign(dx)*r,pos.z)&&!solid(nx+Math.sign(dx)*r,pos.z+r*.7)&&!solid(nx+Math.sign(dx)*r,pos.z-r*.7))pos.x=nx;
 const nz=pos.z+dz;if(!solid(pos.x,nz+Math.sign(dz)*r)&&!solid(pos.x+r*.7,nz+Math.sign(dz)*r)&&!solid(pos.x-r*.7,nz+Math.sign(dz)*r))pos.z=nz;}
function lineOfSight(a,b){const d=b.clone().sub(a);const n=Math.ceil(d.length()/.4);for(let i=1;i<n;i++){const p=a.clone().addScaledVector(d,i/n);if(solid(p.x,p.z))return false;}return true;}
function inFront(p){camera.getWorldDirection(fwd);fwd.y=0;fwd.normalize();const to=p.clone().sub(headW).setY(0).normalize();return fwd.dot(to)>.6;}
function segDist(a,b,p){const ab=b.clone().sub(a),l=ab.lengthSq();if(l<1e-6)return a.distanceTo(p);const k=Math.max(0,Math.min(1,p.clone().sub(a).dot(ab)/l));return a.clone().addScaledVector(ab,k).distanceTo(p);}

// ---- Loop ----
const clock=new THREE.Clock();let calibDone=false,calibT=0,snapReady=true,btnPrev={},torchFlicker=0,redFlash=0,frame=0;
const prevTip=new THREE.Vector3(),tipW=new THREE.Vector3(),headW=new THREE.Vector3(),fwd=new THREE.Vector3(),tmp=new THREE.Vector3(),tw=new THREE.Vector3();
const flashOverlay=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({color:0x880000,transparent:true,opacity:0,depthTest:false,fog:false}));flashOverlay.position.z=-.3;flashOverlay.renderOrder=1000;camera.add(flashOverlay);

function tick(){const dt=Math.min(clock.getDelta(),.05);const t=clock.elapsedTime;const xr=renderer.xr.isPresenting;frame++;
 if(msgT>0){msgT-=dt;if(msgT<=0){msgEl.textContent='';msgPlane.visible=false;}}
 P.iframes-=dt;redFlash=Math.max(0,redFlash-dt);flashOverlay.material.opacity=redFlash*.6;
 // fire flicker
 torchFlicker=Math.max(0,torchFlicker-dt);torch.intensity=torchFlicker>0?(Math.random()<.5?.6:8):5.5+Math.sin(t*13)*.6+Math.sin(t*31)*.4+Math.random()*.4;
 for(const f of flames){const k=1+Math.sin(t*17+f.ph)*.12+Math.random()*.08;f.core.scale.setScalar(.25*f.s*k);f.outer.scale.set(.6*f.s*k,.75*f.s*k,1);}
 // shadows: update torch shadow every other frame in XR (perf)
 renderer.shadowMap.autoUpdate=!xr||frame%2===0;
 let mx=0,mz=0,sprint=false;
 if(!xr){camera.rotation.set(pitch,yaw,0,'YXZ');if(keys.KeyW)mz-=1;if(keys.KeyS)mz+=1;if(keys.KeyA)mx-=1;if(keys.KeyD)mx+=1;sprint=keys.ShiftLeft;if(desktopSwing>0)desktopSwing-=dt;}
 else{const ls=leftSrc?.gamepad,rs=rightSrc?.gamepad;
  if(ls){mx=ls.axes[2]||0;mz=ls.axes[3]||0;if(Math.abs(mx)<.15)mx=0;if(Math.abs(mz)<.15)mz=0;sprint=ls.buttons[5]?.pressed;}
  if(rs){const ax=rs.axes[2]||0;if(Math.abs(ax)>.7&&snapReady){snapReady=false;
    camera.getWorldPosition(headW);const ang=-Math.sign(ax)*Math.PI/6;const off=rig.position.clone().sub(headW);off.applyAxisAngle(THREE.Object3D.DEFAULT_UP,ang);rig.position.copy(headW.add(off)).setY(0);rig.rotateY(ang);}
   if(Math.abs(ax)<.3)snapReady=true;}
  for(const [s,k] of [[leftSrc,'l'],[rightSrc,'r']]){const b=s?.gamepad?.buttons;if(!b)continue;const pot=b[4]?.pressed,trig=b[0]?.pressed;
   if(pot&&!btnPrev[k+'p'])usePotion();if(trig&&!btnPrev[k+'t']&&(P.dead||P.won))restart();btnPrev[k+'p']=pot;btnPrev[k+'t']=trig;}}
 {const bothSticks=xr&&leftSrc?.gamepad?.buttons[3]?.pressed&&rightSrc?.gamepad?.buttons[3]?.pressed;if(bothSticks){calibT+=dt;if(calibT>2&&!calibDone){calibDone=true;calibrateHands();}}else{calibT=0;calibDone=false;}}
 moving+=((mx||mz)&&!P.dead?1:0)-moving>0?dt*4:-dt*4;moving=Math.max(0,Math.min(1,moving));
 if(!P.dead&&!P.won&&(mx||mz)){camera.getWorldDirection(fwd);fwd.y=0;fwd.normalize();const right=tmp.crossVectors(fwd,THREE.Object3D.DEFAULT_UP).normalize();
  const sp=MOVE*(sprint?1.6:1)*dt;const dx=(fwd.x*-mz+right.x*mx)*sp,dz=(fwd.z*-mz+right.z*mx)*sp;
  camera.getWorldPosition(headW);const hp=new THREE.Vector3(headW.x,0,headW.z);const before=hp.clone();tryMove(hp,dx,dz);rig.position.x+=hp.x-before.x;rig.position.z+=hp.z-before.z;}
 camera.updateMatrixWorld(true);camera.getWorldPosition(headW);const pp=new THREE.Vector3(headW.x,0,headW.z);
 updateAvatar(xr,dt);
 // wall torch light pool -> nearest sconces
 if(frame%15===0){const s=torchSpots.slice().sort((a,b)=>a.distanceToSquared(pp)-b.distanceToSquared(pp));poolLights.forEach((l,i)=>s[i]&&l.position.copy(s[i]));}
 poolLights.forEach((l,i)=>l.intensity=5+Math.sin(t*11+i*3)*.8+Math.random()*.5);
 // particles
 const dp=dustG.attributes.position.array;for(let i=0;i<dustN;i++){dp[i*3+1]+=Math.sin(t+i)*.0008;dp[i*3]+=Math.cos(t*.3+i)*.0008;}
 dust.position.set(pp.x,1.5,pp.z);dustG.attributes.position.needsUpdate=true;
 torch.getWorldPosition(tw);for(let i=0;i<emN;i++){emV[i*4+3]-=dt;if(emV[i*4+3]<=0){emP[i*3]=tw.x;emP[i*3+1]=tw.y-.05;emP[i*3+2]=tw.z;emV[i*4]=(Math.random()-.5)*.2;emV[i*4+1]=.3+Math.random()*.5;emV[i*4+2]=(Math.random()-.5)*.2;emV[i*4+3]=.5+Math.random()*1.2;}
  emP[i*3]+=emV[i*4]*dt;emP[i*3+1]+=emV[i*4+1]*dt;emP[i*3+2]+=emV[i*4+2]*dt;}emG.attributes.position.needsUpdate=true;
 fogTex.offset.x=t*.01;groundFog2.material.map.offset.y=t*.006;
 // sword tip velocity
 sword.updateWorldMatrix(true,false);tipW.copy(tipLocal).applyMatrix4(sword.matrixWorld);const tipSpeed=prevTip.distanceTo(tipW)/Math.max(dt,1e-3);
 const swinging=swordHand>=0&&(xr?tipSpeed>2.2:desktopSwing>0.05&&desktopSwing<.3);
 // pages
 for(const p of pages){if(!p.visible)continue;p.rotation.y+=dt;p.position.y=1.15+Math.sin(t*2)*.05;if(p.position.distanceTo(tmp.set(pp.x,1.15,pp.z))<1){p.visible=false;
  say(JOURNAL[P.pages],8);P.pages++;sfx.page();drawHud();
  if(P.pages===3){enemies.forEach(e=>e.speed*=1.2);setTimeout(()=>{if(zombieG){const w=spawn('wraith',pp.clone().add(new THREE.Vector3(0,0,-T)));w.state='hunt';}jumpScare();},2500);}
  if(P.pages>=PAGES_NEEDED){gateOpen=true;gate.visible=false;setTimeout(()=>say("A distant grinding of stone... the NORTH GATE has opened. Escape!",6),8500);enemies.forEach(e=>{e.state='hunt';e.speed*=1.25});}}}
 if(gateOpen&&!P.won&&pp.distanceTo(gatePos)<1.6){P.won=true;say("Alden Kael escapes the Hollow Keep, the truth of the Kael line in hand. YOU WIN. (trigger/click/R to play again)",999);}
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
 prevTip.copy(tipW);
 if(debugCam){camera.getWorldDirection(fwd);debugCam.position.copy(headW).addScaledVector(fwd,1.8);debugCam.position.y=1.4;debugCam.lookAt(headW.x,1.0,headW.z);debugCam.layers.enableAll();renderer.render(scene,debugCam);}else renderer.render(scene,camera);}
let debugCam=null;

say("Your sword rests on your back: reach over your shoulder and squeeze GRIP (desktop: F). Alden Kael, former city guard. The keep of your birth rises in the fog. Find the five journal pages.",8);drawHud();
Promise.all([loadAvatar(),loadZombies()]).then(()=>{loadEl.textContent='';window.__ready=true;}).catch(err=>{console.error('Asset load failed',err);loadEl.textContent='Asset load failed: '+err.message;});
renderer.setAnimationLoop(tick);
window.__game={P,enemies,handOff,palmOff,chk:()=>[0,1].map(i=>{const hd=bones[(i?"Right":"Left")+"Hand"];const bq=hd.getWorldQuaternion(new THREE.Quaternion());const want=handHolder[i].quaternion.clone().multiply(handCorr[i]).multiply(handOff[i]);const f=new THREE.Vector3(0,1,0).applyQuaternion(bq),fg=new THREE.Vector3(0,-1,0).applyQuaternion(handHolder[i].quaternion);const c=bones[(i?"Right":"Left")+"HandMiddle1"].getWorldPosition(new THREE.Vector3());return {angErrDeg:+(bq.angleTo(want)*57.3).toFixed(2),fingerDirErrDeg:+(f.angleTo(fg)*57.3).toFixed(2),knuckleToGrip:+c.distanceTo(handHolder[i].position).toFixed(3)}}),dbg:()=>{const r={};for(const n of ["LeftArm","LeftForeArm","LeftHand","RightHand","Head"])r[n]=bones[n].getWorldPosition(new THREE.Vector3()).toArray().map(v=>+v.toFixed(2));r.h0=handHolder[0].position.toArray().map(v=>+v.toFixed(2));r.h1=handHolder[1].position.toArray().map(v=>+v.toFixed(2));r.cam=headW.toArray().map(v=>+v.toFixed(2));r.avEye=avEye;r.avy=avatar.position.y;return r},look:(y,p)=>{yaw=y;pitch=p},debug:(on)=>{debugCam=on?new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.05,50):null},get swordHand(){return swordHand}};
