import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// ---- Alden Kael character sheet ----
const ALDEN={name:'Alden Kael',hp:48,maxHp:48,focus:20,ac:16,speed:30,str:14,dex:16,con:14,int:12,wis:13,cha:15,atk:5,potions:3};
const mod=s=>Math.floor((s-10)/2);
const MOVE=ALDEN.speed*0.3048/6*1.6; // 30ft/round -> m/s, scaled for play
const PAGES_NEEDED=5;
const JOURNAL=[
 "Page 1: 'The guard captain told me I was found at the keep gate as an infant, wrapped in a blue cloak.'",
 "Page 2: 'The Kael line held this keep. They bargained with something below the crypt.'",
 "Page 3: 'The scar on my cheek... I remember now. A wraith's claw. I was here before, as a child.'",
 "Page 4: 'My mother sealed the crypt with her life and sent me away so the bargain would end.'",
 "Page 5: 'The hollow ones wait for the last Kael. I must not let them leave these walls. Go north. Live.'"
];

const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
renderer.xr.enabled=true;renderer.xr.setFoveation?.(1);
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));
const scene=new THREE.Scene();scene.background=new THREE.Color(0x020306);scene.fog=new THREE.FogExp2(0x05060a,0.11);
const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,0.05,60);
const rig=new THREE.Group();rig.add(camera);scene.add(rig);camera.position.y=1.7;
scene.add(new THREE.HemisphereLight(0x223355,0x050505,0.25));
const moon=new THREE.DirectionalLight(0x6677aa,0.25);moon.position.set(5,10,3);scene.add(moon);

// ---- Level: castle keep grid ----
const M='#'; const MAP=[
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
"#########################".slice(0,23)];
const T=2.5,W=MAP[0].length,H=MAP.length;
const wallMat=new THREE.MeshLambertMaterial({color:0x3a3632});
const floorMat=new THREE.MeshLambertMaterial({color:0x1d1b19});
const wallGeo=new THREE.BoxGeometry(T,3.2,T);
const walls=[];const solid=(x,z)=>{const i=Math.floor(x/T+0.5),j=Math.floor(z/T+0.5);if(j<0||j>=H||i<0||i>=W)return true;const c=MAP[j][i];return c==='#'||(c==='N'&&!gateOpen);};
let wallCount=0;for(const r of MAP)for(const c of r)if(c==='#')wallCount++;
const wallIM=new THREE.InstancedMesh(wallGeo,wallMat,wallCount);let wi=0;const dm=new THREE.Matrix4();
const floor=new THREE.Mesh(new THREE.PlaneGeometry(W*T,H*T),floorMat);floor.rotation.x=-Math.PI/2;floor.position.set((W-1)*T/2,0,(H-1)*T/2);scene.add(floor);
const ceil=floor.clone();ceil.rotation.x=Math.PI/2;ceil.position.y=3.2;ceil.material=new THREE.MeshLambertMaterial({color:0x0c0b0a});scene.add(ceil);
let start=new THREE.Vector3(),gatePos=new THREE.Vector3();const pages=[],ghoulSpawns=[];
const pageMat=new THREE.MeshBasicMaterial({color:0xe8dcb0});
let gateOpen=false,gate;
MAP.forEach((r,j)=>[...r].forEach((c,i)=>{const x=i*T,z=j*T;
 if(c==='#'){dm.makeTranslation(x,1.6,z);wallIM.setMatrixAt(wi++,dm);}
 else if(c==='S')start.set(x,0,z);
 else if(c==='P'){const p=new THREE.Mesh(new THREE.PlaneGeometry(0.25,0.33),pageMat);p.position.set(x,1.1,z);const gl=new THREE.PointLight(0xffd080,0.6,3);p.add(gl);scene.add(p);pages.push(p);}
 else if(c==='G')ghoulSpawns.push(new THREE.Vector3(x,0,z));
 else if(c==='+'){/* broken doorway: candle */const cd=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.25,5),new THREE.MeshBasicMaterial({color:0xffeecc}));cd.position.set(x,.12,z);scene.add(cd);}
 else if(c==='N'){gatePos.set(x,0,z);gate=new THREE.Mesh(new THREE.BoxGeometry(T,3.2,.3),new THREE.MeshLambertMaterial({color:0x2a1a0e,emissive:0x110000}));gate.position.set(x,1.6,z);scene.add(gate);}
}));
scene.add(wallIM);
// pillars, bones decoration
const boneMat=new THREE.MeshLambertMaterial({color:0x8a8270});
for(let k=0;k<25;k++){const x=1+Math.random()*(W-2),z=1+Math.random()*(H-2);if(solid(x*T,z*T))continue;const b=new THREE.Mesh(new THREE.SphereGeometry(.12,6,4),boneMat);b.position.set(x*T,.1,z*T);scene.add(b);}

// ---- Player ----
rig.position.copy(start);
const P={...ALDEN,pages:0,dead:false,won:false,swingCd:0,iframes:0};

// Torch (left hand) - the only real dynamic light besides pages
const torch=new THREE.PointLight(0xff9a40,2.2,9,1.6);
const torchMesh=new THREE.Group();
const stick=new THREE.Mesh(new THREE.CylinderGeometry(.02,.025,.35,6),new THREE.MeshLambertMaterial({color:0x4a2e14}));stick.rotation.x=-Math.PI/2;stick.position.z=-.1;
const flame=new THREE.Mesh(new THREE.ConeGeometry(.04,.12,6),new THREE.MeshBasicMaterial({color:0xffaa33}));flame.position.set(0,0.06,-.28);
torch.position.copy(flame.position);torchMesh.add(stick,flame,torch);
// Sword (right hand)
const sword=new THREE.Group();
const blade=new THREE.Mesh(new THREE.BoxGeometry(.04,.01,.9),new THREE.MeshLambertMaterial({color:0xb0b8c0,emissive:0x111418}));blade.position.z=-.55;
const guard=new THREE.Mesh(new THREE.BoxGeometry(.2,.03,.03),new THREE.MeshLambertMaterial({color:0x6b5520}));guard.position.z=-.08;
const grip=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.18,6),new THREE.MeshLambertMaterial({color:0x2a1a10}));grip.rotation.x=Math.PI/2;
sword.add(blade,guard,grip);
const tipLocal=new THREE.Vector3(0,0,-1.0);
// Wrist HUD (on left hand)
const hudCanvas=document.createElement('canvas');hudCanvas.width=256;hudCanvas.height=128;const hctx=hudCanvas.getContext('2d');
const hudTex=new THREE.CanvasTexture(hudCanvas);
const wrist=new THREE.Mesh(new THREE.PlaneGeometry(.12,.06),new THREE.MeshBasicMaterial({map:hudTex,transparent:true}));
wrist.position.set(0,.04,.06);wrist.rotation.x=-Math.PI/2.4;torchMesh.add(wrist);

// ---- Avatar body (Alden) ----
const skin=new THREE.MeshLambertMaterial({color:0xd8a888}),cloakM=new THREE.MeshLambertMaterial({color:0x1d3f8a,side:THREE.DoubleSide}),leather=new THREE.MeshLambertMaterial({color:0x5a3a20}),hairM=new THREE.MeshLambertMaterial({color:0x4a2e18});
const avatar=new THREE.Group();scene.add(avatar);
const torso=new THREE.Group();avatar.add(torso);
const chest=new THREE.Mesh(new THREE.BoxGeometry(.38,.5,.2),leather);chest.position.y=-.33;
const hips=new THREE.Mesh(new THREE.BoxGeometry(.34,.25,.18),leather);hips.position.y=-.7;
const cape=new THREE.Mesh(new THREE.PlaneGeometry(.5,1.2),cloakM);cape.position.set(0,-.7,.13);
const legG=new THREE.BoxGeometry(.13,.8,.13);const lg1=new THREE.Mesh(legG,leather),lg2=lg1.clone();lg1.position.set(-.09,-1.22,0);lg2.position.set(.09,-1.22,0);
torso.add(chest,hips,cape,lg1,lg2);
// head (hidden from own camera via layer 1, visible in shadows/mirror not used)
const headM=new THREE.Group();const hd=new THREE.Mesh(new THREE.SphereGeometry(.11,8,6),skin);const hr=new THREE.Mesh(new THREE.SphereGeometry(.115,8,6,0,Math.PI*2,0,1.4),hairM);hr.position.y=.02;headM.add(hd,hr);
headM.traverse(o=>o.layers.set(1));avatar.add(headM);
// back sheath: over right shoulder, diagonal
const sheathAnchor=new THREE.Group();sheathAnchor.position.set(.12,-.05,.16);sheathAnchor.rotation.set(-Math.PI/2+.3,0,-.5);torso.add(sheathAnchor);
const scab=new THREE.Mesh(new THREE.BoxGeometry(.06,.03,.95),leather);scab.position.z=-.55;sheathAnchor.add(scab);
// hands
const handG=new THREE.BoxGeometry(.08,.04,.11);
const hands=[0,1].map(()=>{const h=new THREE.Mesh(handG,skin);avatar.add(h);return h;});
// arms (upper/lower) as unit-length boxes scaled along z
const segG=new THREE.BoxGeometry(.07,.07,1);segG.translate(0,0,.5);
const arms=[0,1].map(()=>({up:new THREE.Mesh(segG,cloakM),lo:new THREE.Mesh(segG,leather)}));arms.forEach(a=>avatar.add(a.up,a.lo));
const UPL=.3,LOL=.3;
function placeSeg(m,a,b){m.position.copy(a);m.lookAt(b);m.scale.set(1,1,a.distanceTo(b));}
const _s=new THREE.Vector3(),_e=new THREE.Vector3(),_d=new THREE.Vector3(),_p=new THREE.Vector3();
function ik(shoulder,hand,side,arm){_d.copy(hand).sub(shoulder);let L=Math.min(_d.length(),UPL+LOL-1e-3);_d.normalize();const h=hand.clone();if(_d.length())h.copy(shoulder).addScaledVector(_d,L);
 const a=(UPL*UPL-LOL*LOL+L*L)/(2*L);const r=Math.sqrt(Math.max(0,UPL*UPL-a*a));
 _p.set(side*.6,-1,.3).applyQuaternion(torso.getWorldQuaternion(new THREE.Quaternion()));_p.addScaledVector(_d,-_p.dot(_d)).normalize();
 _e.copy(shoulder).addScaledVector(_d,a).addScaledVector(_p,r);placeSeg(arm.up,shoulder,_e);placeSeg(arm.lo,_e,h);}

// Controllers: hand index 0=left,1=right
const c0=renderer.xr.getController(0),c1=renderer.xr.getController(1);
const g0=renderer.xr.getControllerGrip(0),g1=renderer.xr.getControllerGrip(1);
rig.add(c0,c1,g0,g1);
let leftSrc=null,rightSrc=null;const gripObj=[null,null],srcs=[null,null];
[[c0,g0],[c1,g1]].forEach(([c,g])=>{c.addEventListener('connected',e=>{const s=e.data;const i=s.handedness==='left'?0:1;gripObj[i]=g;srcs[i]=s;if(i===0)leftSrc=s;else rightSrc=s;});
 c.addEventListener('disconnected',e=>{for(let i=0;i<2;i++)if(gripObj[i]===g){gripObj[i]=null;srcs[i]=null;}});});
// desktop hand anchors on camera
const deskHand=[new THREE.Object3D(),new THREE.Object3D()];deskHand[0].position.set(-.25,-.3,-.35);deskHand[1].position.set(.25,-.32,-.3);camera.add(deskHand[0],deskHand[1]);
const handHolder=[new THREE.Group(),new THREE.Group()];scene.add(handHolder[0],handHolder[1]);// world-space hand frames
let swordHand=-1;// -1 sheathed
function sheathe(){swordHand=-1;sheathAnchor.add(sword);sword.position.set(0,0,0);sword.rotation.set(0,0,0);sfx?.swing();}
function draw(i){swordHand=i;handHolder[i].add(sword);sword.position.set(0,0,0);sword.rotation.set(0,0,0);sfx.swing();}
swordHand=-1;sheathAnchor.add(sword);
const torchHand=()=>swordHand===0?1:0;
const gripPrev=[false,false];
function updateAvatar(xr){const hq=camera.getWorldQuaternion(new THREE.Quaternion());camera.getWorldPosition(headW);
 headM.position.copy(headW);headM.quaternion.copy(hq);
 const e=new THREE.Euler().setFromQuaternion(hq,'YXZ');let ty=torso.rotation.y;let dy=e.y-ty;dy=Math.atan2(Math.sin(dy),Math.cos(dy));
 if(Math.abs(dy)>.6)ty+=dy-Math.sign(dy)*.6;ty+=dy*Math.min(1,dt_*2);torso.rotation.y=ty;
 torso.position.set(headW.x,headW.y-.12,headW.z).add(new THREE.Vector3(0,0,.08).applyAxisAngle(THREE.Object3D.DEFAULT_UP,ty));
 torso.updateMatrixWorld(true);
 for(let i=0;i<2;i++){const src=xr?gripObj[i]:deskHand[i];if(!src){hands[i].visible=arms[i].up.visible=arms[i].lo.visible=false;continue;}
  hands[i].visible=arms[i].up.visible=arms[i].lo.visible=true;src.updateWorldMatrix(true,false);src.matrixWorld.decompose(handHolder[i].position,handHolder[i].quaternion,_s);
  if(!xr&&i===1&&desktopSwing>0){const k=1-desktopSwing/.35;handHolder[i].quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.sin(k*Math.PI)*1.4,Math.sin(k*Math.PI)*.8,0)));}
  hands[i].position.copy(handHolder[i].position);hands[i].quaternion.copy(handHolder[i].quaternion);
  const sh=new THREE.Vector3(i===0?-.2:.2,-.12,0).applyMatrix4(torso.matrixWorld);ik(sh,handHolder[i].position,i===0?-1:1,arms[i]);
  // grab/sheathe
  if(xr){const g=!!srcs[i]?.gamepad?.buttons[1]?.pressed;const sa=sheathAnchor.getWorldPosition(_s);
   if(g&&!gripPrev[i]&&swordHand===-1&&handHolder[i].position.distanceTo(sa)<.35&&handHolder[i].position.y>headW.y-.25){draw(i);hapticI(i,1,120);}
   if(!g&&gripPrev[i]&&swordHand===i){sheathe();hapticI(i,.6,80);}gripPrev[i]=g;}}
 const th=torchHand();if(torchMesh.parent!==handHolder[th])handHolder[th].add(torchMesh);torchMesh.position.set(0,0,0);}
function hapticI(i,v,ms){srcs[i]?.gamepad?.hapticActuators?.[0]?.pulse?.(v,ms);}
function attachDesktop(){}
renderer.xr.addEventListener('sessionstart',()=>{document.getElementById('start').style.display='none';audioStart();});

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

// ---- Creatures ----
const eyeMat=new THREE.MeshBasicMaterial({color:0xff2200});
const ghoulMat=new THREE.MeshLambertMaterial({color:0x4a5040});
const wraithMat=new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.85,fog:true});
const enemies=[];
function makeGhoul(pos){const g=new THREE.Group();
 const body=new THREE.Mesh(new THREE.CylinderGeometry(.18,.25,1.1,6),ghoulMat);body.position.y=.8;
 const head=new THREE.Mesh(new THREE.SphereGeometry(.17,6,5),ghoulMat);head.position.y=1.5;
 const armG=new THREE.BoxGeometry(.07,.07,.7);const a1=new THREE.Mesh(armG,ghoulMat),a2=a1.clone();a1.position.set(-.25,1.15,-.3);a2.position.set(.25,1.15,-.3);
 const e1=new THREE.Mesh(new THREE.SphereGeometry(.03,4,3),eyeMat),e2=e1.clone();e1.position.set(-.06,1.53,-.15);e2.position.set(.06,1.53,-.15);
 g.add(body,head,a1,a2,e1,e2);g.position.copy(pos);scene.add(g);
 enemies.push({type:'ghoul',mesh:g,hp:14,maxHp:14,speed:1.3,dmg:[1,8,1],ac:12,home:pos.clone(),state:'wander',cd:0,stun:0,target:pos.clone(),growlT:Math.random()*5});}
function makeWraith(pos){const g=new THREE.Group();
 const cloak=new THREE.Mesh(new THREE.ConeGeometry(.4,1.9,7,1,true),wraithMat);cloak.position.y=1.1;cloak.rotation.x=Math.PI;cloak.rotation.x=0;
 const hood=new THREE.Mesh(new THREE.SphereGeometry(.22,6,5),wraithMat);hood.position.y=2.0;
 const e1=new THREE.Mesh(new THREE.SphereGeometry(.035,4,3),new THREE.MeshBasicMaterial({color:0x66ccff})),e2=e1.clone();e1.position.set(-.07,2.0,-.18);e2.position.set(.07,2.0,-.18);
 g.add(cloak,hood,e1,e2);g.position.copy(pos);scene.add(g);
 enemies.push({type:'wraith',mesh:g,hp:10,maxHp:10,speed:2.0,dmg:[1,6,2],ac:13,home:pos.clone(),state:'wander',cd:0,stun:0,target:pos.clone(),growlT:3,phase:true});}
ghoulSpawns.forEach(p=>makeGhoul(p));
makeWraith(new THREE.Vector3(11*T,0,1*T));makeWraith(new THREE.Vector3(2*T,0,9*T));
const roll=(n,s,b)=>{let t=b;for(let i=0;i<n;i++)t+=1+Math.floor(Math.random()*s);return t;};

// ---- Jump scares: trigger zones ----
const scares=[{x:11*T,z:9*T,done:false},{x:4*T,z:5*T,done:false},{x:19*T,z:2*T,done:false},{x:10*T,z:13*T,done:false}];
const scareFace=new THREE.Group();{const f=new THREE.Mesh(new THREE.SphereGeometry(.35,8,6),new THREE.MeshLambertMaterial({color:0xcfc8b8,emissive:0x222018}));
 const e1=new THREE.Mesh(new THREE.SphereGeometry(.06,5,4),new THREE.MeshBasicMaterial({color:0x000000})),e2=e1.clone();e1.position.set(-.12,.08,-.3);e2.position.set(.12,.08,-.3);
 const m=new THREE.Mesh(new THREE.BoxGeometry(.2,.12,.05),new THREE.MeshBasicMaterial({color:0x200000}));m.position.set(0,-.14,-.32);scareFace.add(f,e1,e2,m);}
scareFace.visible=false;scene.add(scareFace);let scareT=0;
function jumpScare(){sting();scareT=0.7;scareFace.visible=true;haptic(1,300);torchFlicker=1.2;}

// ---- UI helpers ----
const msgEl=document.getElementById('msg'),hudEl=document.getElementById('hud');let msgT=0;
const msgCanvas=document.createElement('canvas');msgCanvas.width=1024;msgCanvas.height=160;const mctx=msgCanvas.getContext('2d');const msgTex=new THREE.CanvasTexture(msgCanvas);
const msgPlane=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.25),new THREE.MeshBasicMaterial({map:msgTex,transparent:true,depthTest:false,fog:false}));msgPlane.position.set(0,-.2,-1.5);msgPlane.renderOrder=999;camera.add(msgPlane);
function say(t,dur=5){msgEl.textContent=t;msgT=dur;mctx.clearRect(0,0,1024,160);mctx.fillStyle='rgba(0,0,0,.6)';mctx.fillRect(0,0,1024,160);mctx.fillStyle='#e8d8b0';mctx.font='28px serif';mctx.textAlign='center';
 const words=t.split(' ');let line='',y=50;for(const w of words){if(mctx.measureText(line+w).width>980){mctx.fillText(line,512,y);line='';y+=36;}line+=w+' ';}mctx.fillText(line,512,y);msgTex.needsUpdate=true;msgPlane.visible=true;}
function drawHud(){hctx.fillStyle='rgba(10,8,6,.85)';hctx.fillRect(0,0,256,128);hctx.fillStyle='#600';hctx.fillRect(10,10,236,28);hctx.fillStyle='#d22';hctx.fillRect(10,10,236*Math.max(0,P.hp)/P.maxHp,28);
 hctx.fillStyle='#fff';hctx.font='bold 20px sans-serif';hctx.fillText(`HP ${Math.max(0,P.hp)}/${P.maxHp}  AC ${P.ac}`,16,32);hctx.fillStyle='#e8d8b0';hctx.fillText(`Potions ${P.potions}  Pages ${P.pages}/${PAGES_NEEDED}`,12,70);
 hctx.fillStyle='#8ac';hctx.fillText(`Focus ${P.focus}/20`,12,105);hudTex.needsUpdate=true;
 hudEl.textContent=`${ALDEN.name} — HP ${Math.max(0,P.hp)}/${P.maxHp} | AC ${P.ac} | Potions ${P.potions} | Pages ${P.pages}/${PAGES_NEEDED} | Focus ${P.focus}`;}
function haptic(v,ms){for(const s of [leftSrc,rightSrc])s?.gamepad?.hapticActuators?.[0]?.pulse?.(v,ms);}
say("Your sword rests on your back: reach over your shoulder and squeeze GRIP (desktop: F). Alden Kael, former city guard. The keep of your birth rises in the fog. Find the five journal pages.",7);drawHud();

function usePotion(){if(P.dead||P.won||P.potions<=0||P.hp>=P.maxHp)return;P.potions--;const h=roll(2,4,2);P.hp=Math.min(P.maxHp,P.hp+h);sfx.heal();say(`Healing potion: +${h} HP`,2);drawHud();}
function hurt(e){if(P.iframes>0||P.dead||P.won)return;const atk=roll(1,20,3);if(atk<P.ac){say(`The ${e.type} misses — your leather armor holds.`,1.5);P.iframes=.6;return;}
 const d=roll(...e.dmg);P.hp-=d;P.iframes=1;sfx.hurt();haptic(.8,200);redFlash=.6;drawHud();if(P.hp<=0)die();}
function die(){P.dead=true;say("Alden Kael has fallen. The keep claims another Kael... Press trigger / click / R to rise again.",999);}
function restart(){location.reload();}
function hitEnemy(e,speed){const atk=roll(1,20,ALDEN.atk);if(atk<e.ac&&speed<4){sfx.swing();return;}
 const d=roll(1,8,mod(ALDEN.str))+(speed>5?roll(1,4,0):0);e.hp-=d;e.stun=.6;sfx.hit();haptic(1,80);
 const push=e.mesh.position.clone().sub(rig.position).setY(0).normalize().multiplyScalar(.6);tryMove(e.mesh.position,push.x,push.z,.3);
 if(e.hp<=0){e.dead=true;scene.remove(e.mesh);say(`The ${e.type} collapses into dust.`,2);}}

// ---- Input (desktop) ----
const keys={};let yaw=0,pitch=0,locked=false,desktopSwing=0;
addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyF'&&!renderer.xr.isPresenting){swordHand===-1?draw(1):sheathe();}if(e.code==='KeyQ')usePotion();if(e.code==='KeyR'&&(P.dead||P.won))restart();});
addEventListener('keyup',e=>keys[e.code]=false);
document.getElementById('play').onclick=()=>{audioStart();renderer.domElement.requestPointerLock();document.getElementById('start').style.display='none';};
renderer.domElement.addEventListener('click',()=>{if(P.dead||P.won)return restart();if(!locked)renderer.domElement.requestPointerLock();else if(desktopSwing<=0&&swordHand>=0){desktopSwing=.35;sfx.swing();}});
document.addEventListener('pointerlockchange',()=>locked=document.pointerLockElement===renderer.domElement);
addEventListener('mousemove',e=>{if(!locked)return;yaw-=e.movementX*.0025;pitch=Math.max(-1.4,Math.min(1.4,pitch-e.movementY*.0025));});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

function tryMove(pos,dx,dz,r=.3){const nx=pos.x+dx;if(!solid(nx+Math.sign(dx)*r,pos.z)&&!solid(nx+Math.sign(dx)*r,pos.z+r*.7)&&!solid(nx+Math.sign(dx)*r,pos.z-r*.7))pos.x=nx;
 const nz=pos.z+dz;if(!solid(pos.x,nz+Math.sign(dz)*r)&&!solid(pos.x+r*.7,nz+Math.sign(dz)*r)&&!solid(pos.x-r*.7,nz+Math.sign(dz)*r))pos.z=nz;}
function lineOfSight(a,b){const d=b.clone().sub(a);const n=Math.ceil(d.length()/.4);for(let i=1;i<n;i++){const p=a.clone().addScaledVector(d,i/n);if(solid(p.x,p.z))return false;}return true;}

// ---- Loop ----
const clock=new THREE.Clock();var dt_=0.016;let snapReady=true,btnPrev={},torchFlicker=0,redFlash=0;
const prevTip=new THREE.Vector3(),tipW=new THREE.Vector3(),headW=new THREE.Vector3(),fwd=new THREE.Vector3(),tmp=new THREE.Vector3();
const flashOverlay=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({color:0x880000,transparent:true,opacity:0,depthTest:false,fog:false}));flashOverlay.position.z=-.3;flashOverlay.renderOrder=1000;camera.add(flashOverlay);

renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),.05);const t=clock.elapsedTime;const xr=renderer.xr.isPresenting;dt_=dt;
 // timers
 if(msgT>0){msgT-=dt;if(msgT<=0){msgEl.textContent='';msgPlane.visible=false;}}
 P.iframes-=dt;redFlash=Math.max(0,redFlash-dt);flashOverlay.material.opacity=redFlash*.6;
 // torch flicker
 torchFlicker=Math.max(0,torchFlicker-dt);torch.intensity=(torchFlicker>0?(Math.random()<.5?.2:1.2):1.9+Math.sin(t*13)*.15+Math.sin(t*31)*.1+Math.random()*.1);flame.scale.y=1+Math.sin(t*20)*.2;
 // input
 let mx=0,mz=0,sprint=false;
 if(!xr){camera.rotation.set(pitch,yaw,0,'YXZ');if(keys.KeyW)mz-=1;if(keys.KeyS)mz+=1;if(keys.KeyA)mx-=1;if(keys.KeyD)mx+=1;sprint=keys.ShiftLeft;
  if(desktopSwing>0)desktopSwing-=dt;}
 else{const ls=leftSrc?.gamepad,rs=rightSrc?.gamepad;
  if(ls){mx=ls.axes[2]||0;mz=ls.axes[3]||0;if(Math.abs(mx)<.15)mx=0;if(Math.abs(mz)<.15)mz=0;sprint=ls.buttons[3]?.pressed;}
  if(rs){const ax=rs.axes[2]||0;if(Math.abs(ax)>.7&&snapReady){snapReady=false;
    camera.getWorldPosition(headW);const ang=-Math.sign(ax)*Math.PI/6;const off=rig.position.clone().sub(headW);off.applyAxisAngle(THREE.Object3D.DEFAULT_UP,ang);rig.position.copy(headW.add(off)).setY(0);rig.rotateY(ang);}
   if(Math.abs(ax)<.3)snapReady=true;}
  for(const [s,k] of [[leftSrc,'l'],[rightSrc,'r']]){const b=s?.gamepad?.buttons;if(!b)continue;const pot=b[4]?.pressed,trig=b[0]?.pressed;
   if(pot&&!btnPrev[k+'p'])usePotion();if(trig&&!btnPrev[k+'t']&&(P.dead||P.won))restart();btnPrev[k+'p']=pot;btnPrev[k+'t']=trig;}}
 if(!P.dead&&!P.won&&(mx||mz)){camera.getWorldDirection(fwd);fwd.y=0;fwd.normalize();const right=tmp.crossVectors(fwd,THREE.Object3D.DEFAULT_UP).normalize();
  const sp=MOVE*(sprint?1.6:1)*dt;const dx=(fwd.x*-mz+right.x*mx)*sp,dz=(fwd.z*-mz+right.z*mx)*sp;
  camera.getWorldPosition(headW);const hp=new THREE.Vector3(headW.x,0,headW.z);const before=hp.clone();tryMove(hp,dx,dz);rig.position.x+=hp.x-before.x;rig.position.z+=hp.z-before.z;}
 camera.getWorldPosition(headW);const pp=new THREE.Vector3(headW.x,0,headW.z);
 updateAvatar(xr);
 // sword tip velocity
 sword.updateWorldMatrix(true,false);tipW.copy(tipLocal).applyMatrix4(sword.matrixWorld);const tipSpeed=prevTip.distanceTo(tipW)/Math.max(dt,1e-3);
 const swinging=swordHand>=0&&(xr?tipSpeed>2.2:desktopSwing>0.05&&desktopSwing<.3);
 // pages
 for(const p of pages){if(!p.visible)continue;p.rotation.y+=dt;p.position.y=1.1+Math.sin(t*2)*.05;if(p.position.distanceTo(tmp.set(pp.x,1.1,pp.z))<1){p.visible=false;p.children[0].intensity=0;
  say(JOURNAL[P.pages],8);P.pages++;sfx.page();drawHud();
  if(P.pages===3){enemies.forEach(e=>e.speed*=1.2);setTimeout(()=>{makeWraith(pp.clone().add(new THREE.Vector3(0,0,-T)).setX(pp.x));jumpScare();},2500);}
  if(P.pages>=PAGES_NEEDED){gateOpen=true;scene.remove(gate);setTimeout(()=>say("A distant grinding of stone... the NORTH GATE has opened. Escape!",6),8500);enemies.forEach(e=>{e.state='hunt';e.speed*=1.25});}}}
 // win
 if(gateOpen&&!P.won&&pp.distanceTo(gatePos)<1.5){P.won=true;say("Alden Kael escapes the Hollow Keep, the truth of the Kael line in hand. YOU WIN. (trigger/click/R to play again)",999);}
 // scares
 for(const s of scares)if(!s.done&&Math.hypot(pp.x-s.x,pp.z-s.z)<1.6){s.done=true;camera.getWorldDirection(fwd);scareFace.position.copy(headW).addScaledVector(fwd,.9);scareFace.lookAt(headW);scareFace.rotateY(Math.PI);jumpScare();}
 if(scareT>0){scareT-=dt;scareFace.position.y+=Math.sin(t*60)*.01;if(scareT<=0)scareFace.visible=false;}
 // enemies
 for(const e of enemies){if(e.dead)continue;const m=e.mesh;const d=m.position.distanceTo(pp);e.stun-=dt;e.cd-=dt;
  const sees=d<9&&lineOfSight(tmp.set(m.position.x,1.5,m.position.z),new THREE.Vector3(pp.x,1.5,pp.z));
  if(sees&&e.state!=='hunt'){e.state='hunt';sfx.growl(Math.max(-1,Math.min(1,(m.position.x-pp.x)/5)));}
  if(!sees&&e.state==='hunt'&&d>12&&!gateOpen)e.state='wander';
  if(e.stun<=0){let goal;if(e.state==='hunt')goal=pp;else{if(m.position.distanceTo(e.target)<.5||Math.random()<.005)e.target.set(e.home.x+(Math.random()-.5)*8,0,e.home.z+(Math.random()-.5)*8);goal=e.target;}
   const dir=goal.clone().sub(m.position).setY(0);if(dir.length()>.8){dir.normalize();let sp=e.speed*(e.state==='hunt'?1:.4)*dt;
    // wraiths stalk: freeze when lit & looked at
    if(e.type==='wraith'){camera.getWorldDirection(fwd);const to=m.position.clone().sub(pp).normalize();if(fwd.dot(to)>.8&&d<6)sp*=.15;m.children[0].material.opacity=.5+Math.sin(t*3)*.3;}
    if(e.type==='wraith'&&e.phase){m.position.x+=dir.x*sp;m.position.z+=dir.z*sp;if(solid(m.position.x,m.position.z)&&d>3){} }else tryMove(m.position,dir.x*sp,dir.z*sp);
    m.lookAt(goal.x,0,goal.z);m.rotateY(Math.PI);}
   m.position.y=e.type==='wraith'?Math.sin(t*2+e.home.x)*.1:Math.abs(Math.sin(t*6))*.05;
   if(d<1.1&&e.cd<=0){e.cd=1.4;hurt(e);}}
  e.growlT-=dt;if(e.growlT<=0){e.growlT=4+Math.random()*6;if(d<10)sfx.growl(Math.max(-1,Math.min(1,(m.position.x-pp.x)/5)));}
  // sword hit
  if(swinging&&!P.dead){const c=tmp.set(m.position.x,1.2,m.position.z);const r=e.type==='wraith'?.5:.45;
   const near=segDist(prevTip,tipW,c)<r||tipW.distanceTo(c)<r+.1||(!xr&&d<2.2&&inFront(m.position));if(near&&(e.hitCd||0)<=0){e.hitCd=.4;hitEnemy(e,xr?tipSpeed:5);hapticI(swordHand,1,90);}}
  e.hitCd=(e.hitCd||0)-dt;}
 prevTip.copy(tipW);
 renderer.render(scene,camera);});
function inFront(p){camera.getWorldDirection(fwd);fwd.y=0;fwd.normalize();const to=p.clone().sub(headW).setY(0).normalize();return fwd.dot(to)>.6;}
function segDist(a,b,p){const ab=b.clone().sub(a),l=ab.lengthSq();if(l<1e-6)return a.distanceTo(p);const k=Math.max(0,Math.min(1,p.clone().sub(a).dot(ab)/l));return a.clone().addScaledVector(ab,k).distanceTo(p);}
window.__game={P,enemies};
